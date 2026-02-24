# FragPunk Tracker

Неофициальный трекер статистики для FragPunk.

## Что умеет проект

- Загрузка скриншотов матчей и распознавание статистики через OCR
- Профиль игрока: средние метрики, динамика, рекорды, активность
- Лидерборд с фильтрами, пагинацией и карточками игроков
- Верификация ранга с модерацией в админке
- Турниры: список, карточка турнира, брекет, матчи, команды и инвайты
- Локализация интерфейса: RU / EN / DE / FR

## Что сделано недавно

- Исправлены критичные сценарии инвайтов в команды:
  - корректный порядок проверок прав и цели,
  - защита от инвайтов на несуществующих или удаленных auth-пользователей,
  - защита от создания "висячих" reject-документов.
- Стабилизирован контракт `POST /tournaments/:id/matches/:matchId/result`:
  - `alreadyCompleted` возвращается только в idempotent-сценарии.
- Доработана админ-панель:
  - вкладки `Tech`, `Community`, `UX metrics`,
  - блок UX-метрик с графиками по дням и выбором периода (7/14/30),
  - удален legacy-блок Hidden ELO.
- Добавлены E2E-тесты на Cypress (`leaderboard`, `navigation`) и исправлен ESLint-конфиг под Cypress-глобалы.
- Добавлен анти-моджибейк контроль:
  - скрипт `npm run check:mojibake`,
  - проверка включена в CI.
- Обновлены пользовательские тексты и состояния UI на более понятные (включая турниры и профиль).

## Технологии

Клиент:
- Vite + React
- Firebase (Auth + Firestore)
- Recharts

Сервер:
- Node.js + Express
- Firebase Admin SDK
- OCR.space API
- Helmet + CORS + rate limit

## Структура проекта

- `client/` - фронтенд-приложение
- `server/` - backend API

## Локальный запуск

Клиент:
```bash
cd client
npm install
npm run dev
```

Сервер:
```bash
cd server
npm install
npm run dev
```

## Переменные окружения

Клиент (`client/.env`):
- `VITE_BACKEND_URL`
- `VITE_FIREBASE_*`

Сервер (`server/.env`):
- `PORT`
- `CORS_ORIGINS`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `OCR_SPACE_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

## Полезные команды

Клиент (`client/`):
- `npm run lint` - линтинг
- `npm run test` - unit/integration тесты (Vitest)
- `npm run cy:open` - открыть Cypress
- `npm run cy:run` - прогон Cypress в headless
- `npm run check:mojibake` - проверка битой кодировки в UI-текстах

Сервер (`server/`):
- `npm test` - тесты роутов и логики API

## Design QA (smoke)

Дизайн-регрессия проверяется через Cypress-спеку:
- `client/cypress/e2e/visual-smoke.cy.js`

Покрытие:
- брейкпоинты `360`, `390`, `768`, `1024`, `1440`
- ключевые страницы: `Players`, `Tournaments`
- базовые UI-состояния: `loading`, `empty`, `error`, `success`
- проверка на критичный горизонтальный overflow body

Как обновлять скриншоты "до/после":
1. Запустить `cd client && npm run cy:run -- --spec cypress/e2e/visual-smoke.cy.js`
2. Забрать артефакты из `client/cypress/screenshots/`
3. Добавить скриншоты в PR/документацию (папки `before`/`after`)

Smoke-checklist перед релизом:
1. На мобильном нет наложения навигации и CTA.
2. Таблицы/карточки не вызывают горизонтальный скролл всей страницы.
3. На `Players` и `Tournaments` читается главный фокус экрана за 2-3 секунды.
4. Состояния `loading/empty/error/success` визуально консистентны.

## Примечание

- Это фанатский неофициальный проект.
- Не аффилирован с FragPunk и издателями игры.
- Не использует официальный код игры, серверы или сетевую инфраструктуру.
