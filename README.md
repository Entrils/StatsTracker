# FragPunk Tracker

Сайт проекта: fragpunktracker.fun

Неофициальный трекер статистики для FragPunk. Загружайте скриншоты матча, распознавайте статистику через OCR и анализируйте прогресс, тренды и лидерборды.

## Возможности

- OCR разбор скриншотов (EN/RU/FR/DE)
- Личный дашборд: средние, тренды, рекорды, активность
- Сравнение с глобальными средними + процентили
- Лидерборд с фильтрами и пагинацией
- Верификация ранга (модерация админом)
- Добавление соцсетей (Twitch/YouTube/TikTok)
- Админ-панель: пересборка лидерборда, заявки на ранги, баны
- Полная локализация интерфейса (RU/EN/FR/DE)

## Разделы

- Лидерборд игроков
- Мой профиль (статистика, рекорды, графики, ранги)
- Профиль игрока
- Загрузка скриншота (OCR)
- Админ-панель
- Policy / Ads / Support
- Settings (соцсети + верификация рангов)

## Технологии

Клиент
- Vite + React
- Recharts
- Firebase (Auth + Firestore)
- Собственная i18n-логика

Сервер
- Node.js + Express
- Firebase Admin SDK
- OCR.space API
- Rate limiting, CORS, Helmet, CSP

## Структура

```
client/   # фронтенд (Vite)
server/   # бэкенд (Express API)
```

## Локальный запуск

Требования:
- Node.js 18+ (рекомендуется 20)
- Firebase проект

Клиент:
```
cd client
npm install
npm run dev
```

Сервер:
```
cd server
npm install
npm run dev
```

## Переменные окружения

Используйте .env.example как шаблон.

Client: `client/.env`
- VITE_BACKEND_URL
- VITE_FIREBASE_* (Web config Firebase)

Server: `server/.env`
- PORT
- CORS_ORIGINS
- DISCORD_CLIENT_ID
- DISCORD_CLIENT_SECRET
- DISCORD_REDIRECT_URI
- OCR_SPACE_API_KEY
- FIREBASE_SERVICE_ACCOUNT_JSON
- GLOBAL_CACHE_TTL_MS
- PERCENTILES_CACHE_TTL_MS
- RANK_SUBMIT_DAILY_LIMIT
- STEAM_APP_ID (e.g. `2943650`)
- STEAM_ONLINE_CACHE_TTL_MS

## OCR пайплайн (Upload)

1) Клиент подготавливает изображение (crop/контраст)
2) Извлекается Match ID и результат
3) OCR.space распознаёт таблицу игрока
4) Данные пишутся в Firestore
5) Бэкенд обновляет лидерборд

## Модель данных (упрощённо)

Firestore коллекции:
- users/{uid}/matches/{matchId}
- matches/{matchId}
- matches/{matchId}/players/{uid}
- leaderboard_users/{uid}
- stats_cache/{docId}
- rate_limits/{docId}
- rank_submissions/{docId}
- bans/{uid}

## Админ и модерация

- Пересборка лидерборда
- Проверка заявок на верификацию ранга
- Бан/разбан пользователей (OCR + лидерборд)

## Важно

- Проект неофициальный и фанатский.
- Не связан с FragPunk или его издателями.
- Не использует официальный игровой код/сети.
