# Client (FragPunk Tracker)

Фронтенд приложения на React + Vite.

## Быстрый старт

```bash
npm install
npm run dev
```

## Скрипты

- `npm run dev` - запуск в режиме разработки
- `npm run build` - production-сборка
- `npm run preview` - предпросмотр production-сборки
- `npm run lint` - проверка ESLint
- `npm run test` - тесты Vitest
- `npm run cy:open` - открыть Cypress UI
- `npm run cy:run` - прогон Cypress в headless
- `npm run check:mojibake` - поиск битой кодировки в интерфейсных текстах

## Visual Smoke QA

Основная smoke-спека по визуальной регрессии:
- `cypress/e2e/visual-smoke.cy.js`

Что она проверяет:
- брейкпоинты: `360`, `390`, `768`, `1024`, `1440`
- страницы: `Players`, `Tournaments`
- состояния интерфейса: `loading`, `empty`, `error`, `success`
- отсутствие критичного overflow на уровне `document.body`

Быстрый запуск:
```bash
npm run cy:run -- --spec cypress/e2e/visual-smoke.cy.js
```

Чеклист перед мерджем UI-изменений:
1. Mobile: нет дублирующих primary CTA в первом экране.
2. Desktop/Tablet: заголовки, статусы и KPI читаются без "визуальной каши".
3. State-блоки едины по стилю и тону (`loading/empty/error/success`).
4. Скриншоты Cypress в `cypress/screenshots` обновлены для сравнения "до/после".

## Примечание

Основные пользовательские тексты находятся в `client/src/i18n`.
