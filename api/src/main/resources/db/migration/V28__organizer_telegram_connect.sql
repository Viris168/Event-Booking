-- Deep-link connect flow for organizer_profile.telegram_chat_id.
--
-- That column has existed since V1 and is always written NULL - there was no
-- way to learn a chat id, because a bot can only message a chat that has
-- already messaged the bot first. These two columns hold the one-time,
-- expiring token an organiser's "Connect Telegram" click generates: the
-- webhook matches an incoming /start <token> back to this row, sets
-- telegram_chat_id, and clears both columns again.
ALTER TABLE organizer_profile
    ADD COLUMN telegram_connect_token TEXT,
    ADD COLUMN telegram_connect_expires_at TIMESTAMPTZ;

-- Partial: most rows have no token in flight, and a plain UNIQUE constraint
-- would collide every one of those NULLs against each other.
CREATE UNIQUE INDEX uq_organizer_profile_telegram_token
    ON organizer_profile (telegram_connect_token)
    WHERE telegram_connect_token IS NOT NULL;
