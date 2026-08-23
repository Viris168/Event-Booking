-- ABA PayWay's legacy transaction record.
-- The ABA integration persists the provider request separately from the
-- provider-agnostic payment_transaction table used by the Bakong flow.
CREATE TABLE payments (
    tranid                  VARCHAR(255) PRIMARY KEY,
    created_at              TIMESTAMPTZ NOT NULL,
    additional_params       TEXT,
    amount                  DOUBLE PRECISION,
    cancelurl               TEXT,
    continue_successurl     TEXT,
    currency                VARCHAR(32),
    custom_fields           TEXT,
    email                   VARCHAR(255),
    firstname               VARCHAR(255),
    google_pay_token        TEXT,
    hash                    TEXT,
    items                   TEXT,
    lastname                VARCHAR(255),
    lifetime                BIGINT,
    merchantid              VARCHAR(255),
    payment_gate            BIGINT,
    payment_option          VARCHAR(64),
    payout                  TEXT,
    phone                   VARCHAR(64),
    req_time                VARCHAR(32),
    return_deeplink         TEXT,
    return_params           TEXT,
    returnurl               TEXT,
    shipping                DOUBLE PRECISION,
    skip_success_page       BIGINT,
    payment_status          VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    type                    VARCHAR(32),
    view_type               VARCHAR(32)
);

CREATE INDEX idx_payments_status_created_at
    ON payments (payment_status, created_at);
