# GramSoft Release

This is a complete deployable project containing the current GramSoft backend and frontend.

## Latest notification fixes

- Admin sidebar badges are driven by one shared notification provider.
- Opening the notification center marks the current unread notification stream as seen with one batch API request.
- The sidebar badge count therefore clears immediately after the admin opens notifications.
- Clicking an individual notification still marks it read and navigates to its destination.
- Notification read failures roll back the optimistic UI state without making a second GET request.
- Notification loading is deduplicated during React StrictMode effect replay.
- The notification popover is viewport-safe and no longer renders off the left edge of the desktop sidebar.
- Notification lists use bounded scrolling and break long text safely.
- Global layout guards prevent common flex/grid/card children from forcing horizontal page overflow.

## Run locally

Backend:

```powershell
cd backend
npm install
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Create `backend/.env` from `backend/.env.example` and provide your real `MONGODB_URI`, JWT secret, and other environment-specific values.

For production, run `npm run build` inside `frontend` and deploy the generated `dist` directory with the backend/API configured as required by your hosting environment.

## Verification performed in this release

- Backend JavaScript syntax check: all backend source files pass.
- Frontend source parsing: all 69 JS/JSX source files parse successfully.
- Dependency installation / full Vite build could not be completed in the isolated build environment because package installation timed out; run the normal `npm install` + `npm run build` locally or in CI before deployment.
