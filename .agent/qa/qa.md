# QA Config — fledz-travel

## Ports
| Service  | Port  | URL                        |
|----------|-------|----------------------------|
| Frontend | 3022  | http://localhost:3022       |
| Backend  | 6022  | http://localhost:6022       |

## Run command
```
npm run dev
```
Runs both frontend (Vite) and backend (Node --watch) via `concurrently`.

## Health checks
- Frontend live: http://localhost:3022
- Backend alive: http://localhost:6022/auth/me (returns 401 if not logged in — that's fine, means backend is up)

## Common port pitfalls
- If backend binds to the wrong port, check for a stale shell env var:
  ```powershell
  $env:PORT          # should be empty or 6022
  Remove-Item Env:PORT   # clear it if wrong
  ```
- Vite proxies `/api` and `/auth` to `http://localhost:6022` — if you see ECONNREFUSED in vite logs, the backend is not running or is on the wrong port.

## Login
- Google OAuth — click "Sign in with Google" on the login page
- Callback URL: http://localhost:6022/auth/google/callback

## Notes
- `predev` script runs `npx kill-port 3022 6022` before starting to avoid EADDRINUSE errors
- `.env` lives at `backend/.env` — PORT should be `6022` there
