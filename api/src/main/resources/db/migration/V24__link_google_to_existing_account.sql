-- Linking a Google identity to an account that already exists.
--
-- V9 made provider_subject unique per provider:
--
--     UNIQUE (provider, provider_subject)
--
-- which was right while an account could only ever be created BY a provider.
-- Once an account registered with a phone and password can attach Google to
-- itself, that pair stops being enough. The linked row keeps provider = 'LOCAL'
-- - that column records how the account came into existence, and rewriting
-- history to say "this was a Google account all along" would be a lie the
-- account panel then has to work around. So the same Google subject could sit
-- on a ('LOCAL', sub) row and a ('GOOGLE', sub) row at once, and one Google
-- identity would sign in to two different accounts depending on which was
-- found first.
--
-- The subject has to be unique on its own. Partial, because provider_subject is
-- null for every account that has never linked anything, and NULLs are not
-- distinct enough for a plain UNIQUE to leave them alone at this scale.
--
-- The V9 constraint stays. It is implied by this one now rather than contested
-- by it, and dropping a constraint to replace it with a stricter one is a
-- window - however brief - in which neither is enforced.
CREATE UNIQUE INDEX uq_app_user_provider_subject_global
    ON app_user (provider_subject)
    WHERE provider_subject IS NOT NULL;
