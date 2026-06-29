# Техническое задание (ТЗ) — система «ГДЕ ТОРТ?»

> B2B-платформа управления накладными, доставкой, возвратами и аналитикой
> для кондитерского производства (поставки в торговые сети, напр. Korzinka).

---

## 1. Общие сведения

| Параметр | Значение |
|---|---|
| Назначение | Формирование накладных/счёт-фактур из SAP-выгрузок, реестр, экспедиция (маршруты водителей), возвраты, аналитика |
| Пользователи | Сотрудники поставщика: администраторы и операторы |
| Языки интерфейса | Узбекский, Русский, English (i18n, переключение на лету) |
| Платформы | Desktop и Mobile — обе первоклассные (полностью адаптивный UI) |
| Хостинг (web) | Netlify |
| Хостинг (api) | Render |
| База данных | MongoDB Atlas |

---

## 2. Архитектура

Трёхзвенная: **клиент (браузер) → SPA-фронтенд → REST API → БД**.

- **Frontend** — Next.js 15 (App Router), React 19, TypeScript. Один объёмный
  клиентский компонент-страница + библиотека UI/i18n (`lib/ui.ts`). Запросы к
  API через `lib/api.ts` с Bearer-JWT. Парсинг Excel на клиенте (`xlsx`),
  штрих-коды (`JsBarcode`), экспорт XLSX.
- **Backend** — NestJS 10, модульная структура (13 модулей), Mongoose 8.
  Сквозные слои: Helmet, CORS (allow-list по `WEB_ORIGIN`), compression,
  Throttler (120 запросов/мин), `JwtAuthGuard` + `RolesGuard`.
- **БД** — MongoDB Atlas, 11 коллекций, индексы, `timestamps`.

> ⚠️ Известное окружение: MongoDB Atlas использует SRV-строку подключения;
> при блокировке DNS SRV локально (`querySrv EREFUSED`) использовать DNS 1.1.1.1
> либо SRV-less строку. CORS должен включать оба `localhost:3000` и `:3001` для
> локальной разработки.

---

## 3. Технологический стек

**Frontend:** `next@15`, `react@19`, `typescript`, `lucide-react`, `clsx`, `xlsx`, JsBarcode (CDN).
**Backend:** `@nestjs/*@10`, `mongoose@8`, `@nestjs/jwt`, `passport-jwt`, `bcryptjs`, `class-validator`, `@nestjs/throttler`, `helmet`, `compression`, `xlsx`.
**Инфраструктура:** Netlify, Render, MongoDB Atlas. Монорепозиторий (`apps/web`, `apps/api`), Git → GitHub.

---

## 4. Роли и доступ

| Роль | Права |
|---|---|
| `admin` | Полный доступ: пользователи, каталог, реквизиты, удаление сессий/возвратов (hard delete), аналитика, аудит |
| `user` | Создание/восстановление накладных и сессий, загрузка заказов, возвраты, расписание (view), документы |

Аутентификация — JWT (срок жизни **8 ч**, `JWT_EXPIRES_IN`). Пароли — bcrypt
(`passwordHash`, `select:false`). При 401 (истёкший токен) — уведомление и
возврат на экран входа. Защита эндпоинтов: `@UseGuards(JwtAuthGuard)`,
admin-операции — дополнительно `RolesGuard` + `@Roles('admin')`.

---

## 5. Функциональные модули (по разделам UI)

1. **Orders / Заказы** — загрузка SAP-выгрузки (Excel), выбор листа, генерация
   накладных, имя реестра привязано к имени файла (`дата_имяфайла`), дедуп по
   имени (повторный файл реестр не создаёт). История заказов: Restore + Remove.
2. **Registry / Реестр** — реестр накладных за период, экспорт XLSX, ручной ввод.
3. **Table / Таблица** — табличный просмотр позиций.
4. **Documents / Документы** — печать накладных-счёт-фактур (на экране и в печать/PDF),
   штрих-код заказа, реквизиты, итоги, сумма прописью; печать выбранных.
5. **Dispatch / Экспедиция** — распределение по водителям, маршруты.
6. **Schedule / Расписание** — график доставки по магазинам/дням недели,
   заморозка шапки и левых колонок, «нет в графике сегодня» / «не найдено».
7. **Statistics, Analytics / Аналитика** — KPI-карточки, вкладки Товар/Магазин/Продажа,
   возвраты по датам, % возврата = возврат/выдано.
8. **Returned / Возвраты (Vazvrat)** — загрузка возвратов (Excel), список по датам,
   удаление по дате/все (admin).
9. **Settings / Настройки** — каталог, реквизиты, исключения, история, доступ
   (пользователи), доверенность (Power of Attorney).
10. **Preferences / Личное** — тема, акцентный цвет, плотность таблиц, размер шрифта
    (zoom 0.9–1.25), язык.

---

## 6. Модель данных (коллекции MongoDB)

- **User** — `name, email(unique), passwordHash, role(admin|user), active, passwordChangedAt`.
- **Invoice** — `invNo(unique), order, storeCode, short, seq, market, label, address, dateIso, manual, lines[InvoiceItem], sumCost, sumVat, sumTotal, sumQty, status(draft|saved|delivered|cancelled), createdBy, updatedBy, originalDateIso, undeliverComment/By/At`.
- **InvoiceItem** (вложенный) — `sku, name, unit, qty, price, cost, vat, total, init`.
- **Session** — `name, invoiceDate, savedAt, invoiceCount, sumTotal, snapshot, versions[SessionVersion], savedBy, deletedAt, deletedBy` (мягкое удаление/корзина + версии).
- **Order / OrderItem** — `storeCode, market, items[], totals, createdBy, deliveredBy`.
- **Vazvrat** — `date, marketCode, marketName, sapCode, productName, qty, pricePerUnit, totalWithVat, orderNo, uploadedBy`.
- **Product (catalog)** — `sku(unique), name, unit, price, order, stock, reserved`.
- **Customer** — `name, code, address, ..., active`.
- **Requisites** — `key(default), supplier{...}, receiver{...}, contract`.
- **ImportRecord** — `type, fileName, payload[], status(pending|completed|failed)`.
- **InventoryMovement** — `date, sku, type, qty, ...`.
- **AuditLog** — `action, entity, entityId, actor, before, after` (журнал изменений).

Денежные расчёты (канонический движок `invoice-engine.service.ts`):
`cost = round2(qty × price)`, `vat = round2(cost × 0.12)`, `total = round2(cost + vat)`;
итоги — суммы округлённых строк (гарантированно сходятся с колонками).

---

## 7. API (REST, префикс `/api`)

| Контроллер | Эндпоинты |
|---|---|
| `auth` | POST `/login`, GET `/me` |
| `users` (admin) | GET `/`, POST `/`, PATCH `/:id` |
| `catalog` | GET `/`, POST `/`, PATCH `/:id`, DELETE `/:id`, POST `/reset` |
| `customers` | GET `/`, GET `/names`, GET `/:id`, POST `/`, PATCH `/:id`, DELETE `/:id` |
| `invoices` | GET `/`, GET `/cancelled`, GET `/:invNo`, POST `/generate`, POST `/manual`, PATCH `/:invNo`, DELETE `/:invNo`, PATCH `/:invNo/restore`, DELETE `/:invNo/hard`, PATCH `/:invNo/deliver`, PATCH `/:invNo/undeliver` |
| `sessions` | GET `/`, GET `/deleted`, GET `/check-duplicate`, GET `/:id`, POST `/`, DELETE `/:id`, PATCH `/:id/restore`, DELETE `/:id/hard` |
| `orders` | GET `/`, GET `/:id`, POST `/`, PATCH `/:id`, PATCH `/:id/deliver` |
| `vazvrat` | POST `/upload`, GET `/`, GET `/dates`, GET `/analytics`, DELETE `/by-date/:date`, DELETE `/all`, POST `/delete-dates` |
| `imports` | GET `/`, POST `/`, POST `/upload` |
| `inventory` | GET `/movements`, POST `/movements` |
| `requisites` | GET `/`, PUT `/`, POST `/reset` |
| `analytics` | GET `/dashboard`, `/products`, `/inventory`, `/customers`, `/users`, `/sessions-merged` |
| `audit` (admin) | GET `/` |
| `health` | GET `/` |

---

## 8. Безопасность

- JWT (Bearer), bcrypt-хэши, `passwordHash` не выдаётся в ответах.
- `JwtAuthGuard` на всех бизнес-эндпоинтах; admin-операции под `RolesGuard`.
- Helmet (заголовки), CORS allow-list, rate-limit 120/мин, compression.
- Валидация DTO через `class-validator`.
- Аудит ключевых изменений (`AuditLog`).

---

## 9. Нефункциональные требования

- **Адаптивность:** полноценная работа на desktop и mobile (≤640px). Списочные
  строки сворачивают действия в kebab-меню `⋮`; таблицы — заморозка шапки/колонок,
  горизонтальный скролл.
- **i18n:** все строки через `T()`/`t(lang, …)`, 3 языка.
- **Печать:** накладная всегда рендерится в 100% (counter-zoom), без фонов в
  служебных ячейках; печать/PDF совпадает с экраном.
- **Производительность:** пагинация (`page/limit=200`), индексы в БД, мемоизация
  агрегатов на клиенте.
- **Темизация:** светлая/тёмная тема, акцентный цвет, плотность таблиц, размер шрифта.

---

## 10. Окружение и деплой

| Окружение | Web | API | DB |
|---|---|---|---|
| Prod | Netlify | Render (`gde-tort-api.onrender.com`) | MongoDB Atlas |
| Local | `:3001` (dev:web) | `:3000` (dev:api) | Atlas / локальный Mongo |

Переменные API: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN` (8h), `WEB_ORIGIN`
(CORS allow-list). Сборка фронтенда — `next build`; запуск dev — `npm run dev:web`.

---

_Документ отражает фактическую реализацию репозитория (`apps/web`, `apps/api`) на дату составления._
