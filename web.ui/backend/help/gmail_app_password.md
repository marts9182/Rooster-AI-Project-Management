# Gmail App Password

The dashboard uses Gmail SMTP to send reminder emails. Because two-factor
auth is on, you can't use your regular password — you need an **App
Password**.

## Steps

1. Go to https://myaccount.google.com/security
2. Confirm **2-Step Verification** is on. If not, turn it on first.
3. Open **App passwords** (https://myaccount.google.com/apppasswords).
4. Choose **Mail** as the app and **Other (custom name)** as the device.
5. Name it "Rooster Dashboard" and click **Generate**.
6. Copy the 16-character password Google shows you.
7. Paste it into `web.ui/backend/.env` as `GMAIL_APP_PASSWORD=...`.
8. Restart the server.

## If you ever rotate the password

Re-run steps 3–7 and update `.env`. The dashboard reads the env on boot.

## Troubleshooting

- **535-5.7.8 Username and Password not accepted** → the app password is
  wrong or stale. Generate a new one.
- **No email arriving** → check the toast still fires. If toast works but
  email doesn't, the SMTP credentials are bad — start at step 3.
