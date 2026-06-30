# План реализации `chatgpt2codex`

## Цель

Сделать CLI-тулзу, запускаемую через `npx`, которая импортирует публично расшаренный ChatGPT-чат в локальную сессию Codex CLI.

Пример входа:

```bash
npx chatgpt2codex https://chatgpt.com/share/6a434af9-76b4-83ec-8ca1-eb86368398c4
```

По умолчанию сессия создается для текущей папки. Если для этой папки уже есть Codex-сессия, команда должна завершиться с ошибкой.

## Изученный формат Codex CLI

Codex CLI хранит локальные сессии в:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl
```

Первая строка JSONL-файла:

```json
{
  "timestamp": "2026-06-30T04:49:40.189Z",
  "type": "session_meta",
  "payload": {
    "session_id": "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
    "id": "019f16dc-8b54-7d52-af4e-4b86b7ce0460",
    "timestamp": "2026-06-30T04:49:40.189Z",
    "cwd": "/home/dev/chatgpt2codex",
    "originator": "codex-tui",
    "cli_version": "0.142.4",
    "source": "cli",
    "thread_source": "user",
    "model_provider": "openai"
  }
}
```

Основные типы строк:

- `session_meta` - метаданные сессии, включая `cwd`.
- `response_item` - сообщения пользователя и ассистента.
- `event_msg` - события для UI/истории.
- `turn_context` - контекст запуска, опционален для импортированной истории.

Формат сообщений:

```json
{
  "type": "message",
  "role": "user",
  "content": [
    {
      "type": "input_text",
      "text": "..."
    }
  ]
}
```

```json
{
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "output_text",
      "text": "..."
    }
  ]
}
```

В новых версиях Codex также есть `~/.codex/state_5.sqlite`, но durable-источник остается JSONL. Для MVP не стоит писать SQLite напрямую, чтобы не тащить нативную зависимость в `npx`-пакет. Codex умеет восстанавливать индекс из JSONL.

## Изученный формат ChatGPT share

Страница `https://chatgpt.com/share/<id>` отдает HTML с React Router stream payload.

Нужные данные находятся не в стабильном DOM, а внутри:

```js
window.__reactRouterContext.streamController.enqueue("...")
```

Содержимое строки - JSON reference-table/devalue-подобного формата. После декодирования доступны:

- `title`
- `conversation_id`
- `create_time`
- `update_time`
- `default_model_slug`
- `mapping`
- `linear_conversation`
- `model`

Для импорта нужно проходить `linear_conversation`, доставать видимые сообщения с `message.author.role` равным `user` или `assistant`, извлекать текст из `message.content.parts` и пропускать hidden/system/tool/internal сообщения.

## Предлагаемый CLI

```bash
npx chatgpt2codex <share-url>
npx chatgpt2codex <share-url> --cwd /path/to/project
npx chatgpt2codex <share-url> --dry-run
```

Флаги:

- `--cwd, -C <dir>` - папка, к которой привязать Codex-сессию. По умолчанию `process.cwd()`.
- `--codex-home <dir>` - папка Codex. По умолчанию `$CODEX_HOME` или `~/.codex`.
- `--name <name>` - переопределить имя импортированной сессии.
- `--dry-run` - распарсить чат и показать, что будет создано, без записи файлов.
- `--include-archived` - учитывать архивные сессии при проверке существующего `cwd`.

По умолчанию команда не перезаписывает и не добавляет вторую сессию для того же `cwd`.

## Рекомендуемые зависимости

- `commander` - CLI.
- `zod` - валидация структур после парсинга.
- `fast-glob` - поиск существующих rollout-файлов.
- `picocolors` - компактный цветной вывод.
- `write-file-atomic` - безопасная запись JSONL.
- `uuid` - генерация `thread_id`, желательно UUIDv7.

Не использовать в MVP:

- Headless browser / Playwright для парсинга ChatGPT, потому что структурированный payload уже есть в HTML.
- `better-sqlite3` или другие нативные sqlite-зависимости, потому что это усложнит `npx`-запуск.

## Алгоритм импорта

1. Разобрать аргументы CLI.
2. Проверить URL вида `https://chatgpt.com/share/<id>`.
3. Разрешить `cwd` через `realpath`.
4. Определить Codex home:
   - `$CODEX_HOME`, если задан.
   - иначе `~/.codex`.
5. Просканировать `~/.codex/sessions/**/rollout-*.jsonl`.
6. Для каждого файла прочитать первую строку.
7. Если первая строка - `session_meta`, сравнить `payload.cwd` с target `cwd`.
8. Если совпадение найдено, завершиться с ошибкой.
9. Скачать ChatGPT share HTML через `fetch`.
10. Найти `window.__reactRouterContext.streamController.enqueue(...)`.
11. Распарсить JS string literal.
12. Распарсить внутренний JSON reference table.
13. Декодировать table в обычный объект с мемоизацией ссылок.
14. Найти conversation data в `loaderData["routes/share.$shareId.($action)"].serverResponse.data`.
15. Нормализовать сообщения:
    - оставить только `user` и `assistant`;
    - пропустить пустые, hidden, system, tool и internal сообщения;
    - склеить текстовые `parts` через пустую строку;
    - attachment/image в MVP заменить коротким текстовым placeholder, если нужно.
16. Сгенерировать `thread_id`.
17. Построить путь:
    `~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<thread_id>.jsonl`.
18. Записать первую строку `session_meta`.
19. Для каждого сообщения записать `response_item`.
20. Дополнительно записать соответствующий `event_msg`, чтобы история корректно отображалась в UI.
21. Опционально добавить имя в `~/.codex/session_index.jsonl`.
22. Проверить, что итоговый JSONL парсится построчно.

## Минимальный Codex rollout

`session_meta`:

```json
{
  "timestamp": "2026-06-30T04:49:40.189Z",
  "type": "session_meta",
  "payload": {
    "session_id": "<thread_id>",
    "id": "<thread_id>",
    "timestamp": "2026-06-30T04:49:40.189Z",
    "cwd": "<target cwd>",
    "originator": "chatgpt2codex",
    "cli_version": "chatgpt2codex/<version>",
    "source": "chatgpt",
    "thread_source": "user",
    "model_provider": "openai"
  }
}
```

Сообщение пользователя:

```json
{
  "timestamp": "2026-06-30T04:49:41.000Z",
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "..."
      }
    ]
  }
}
```

Сообщение ассистента:

```json
{
  "timestamp": "2026-06-30T04:49:42.000Z",
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "output_text",
        "text": "..."
      }
    ]
  }
}
```

## Модули

Предлагаемая структура:

```text
src/
  cli.ts
  fetchShare.ts
  decodeReactRouterStream.ts
  parseChatGptShare.ts
  normalizeConversation.ts
  findExistingCodexSession.ts
  writeCodexRollout.ts
  paths.ts
  types.ts
```

Назначение:

- `cli.ts` - аргументы, orchestration, вывод ошибок.
- `fetchShare.ts` - загрузка HTML.
- `decodeReactRouterStream.ts` - изолированный декодер reference-table payload.
- `parseChatGptShare.ts` - поиск stream payload и извлечение conversation data.
- `normalizeConversation.ts` - перевод ChatGPT nodes в простой список сообщений.
- `findExistingCodexSession.ts` - проверка, есть ли уже сессия для `cwd`.
- `writeCodexRollout.ts` - генерация JSONL Codex-сессии.
- `paths.ts` - Codex home, session path, даты.
- `types.ts` - общие типы и zod-схемы.

## Тесты

Минимальный набор:

- Декодер React Router stream payload на маленькой synthetic fixture.
- Парсер ChatGPT share на sanitized fixture без приватного текста.
- Нормализация `linear_conversation`.
- Проверка collision detection по `session_meta.payload.cwd`.
- Snapshot-тест JSONL writer.
- `--dry-run` не пишет файлов.
- Запись в временный `CODEX_HOME`.

## Риски

- ChatGPT share payload не является публичным API и может измениться.
- Codex rollout JSONL - внутренний формат, хотя он стабилен для текущей версии `codex-cli 0.142.4`.
- Если будущий Codex станет полагаться только на SQLite-индекс, понадобится отдельный индексатор или официальный import hook.
- Images, files, tool calls, hidden messages и reasoning не стоит полноценно импортировать в MVP.

## Этапы

1. Инициализировать npm-пакет с TypeScript и `bin`.
2. Реализовать CLI-скелет и `--dry-run`.
3. Реализовать fetch и парсер ChatGPT share.
4. Реализовать нормализацию сообщений.
5. Реализовать поиск существующей Codex-сессии для `cwd`.
6. Реализовать writer Codex JSONL.
7. Добавить unit-тесты и fixtures.
8. Прогнать smoke-test на временном `CODEX_HOME`.
9. Проверить ручной сценарий: импорт, затем `codex resume`.

