-- PayFlow local demo seed; see README.md for the assumed demo balances.
BEGIN;
SET LOCAL TIME ZONE 'UTC';

INSERT INTO users (
    full_name,
    mobile,
    email,
    password_hash,
    role,
    status,
    must_reset_pw
)
SELECT
    seed.full_name,
    seed.mobile,
    seed.email,
    '$argon2id$v=19$m=19456,t=2,p=1$0ZvPYfeKpCzmKHF5M2U2sw$NaKcvwvPZ+XCkj+fKSHooCIB2G6XWQiS58+PxIw+yoM',
    seed.role,
    seed.status,
    TRUE
FROM (
    SELECT
        'PayFlow Demo Admin'::VARCHAR AS full_name,
        '01710000999'::CHAR(11) AS mobile,
        'admin@payflow.test'::VARCHAR AS email,
        'ADMIN'::user_role AS role,
        'ACTIVE'::user_status AS status
    UNION ALL
    SELECT
        'Demo Agent ' || lpad(i::TEXT, 2, '0'),
        ('01710000' || lpad(i::TEXT, 3, '0'))::CHAR(11),
        'agent' || lpad(i::TEXT, 2, '0') || '@payflow.test',
        'AGENT'::user_role,
        'ACTIVE'::user_status
    FROM generate_series(1, 3) AS agents(i)
    UNION ALL
    SELECT
        'Demo Customer ' || lpad(i::TEXT, 2, '0'),
        ('01710000' || lpad((100 + i)::TEXT, 3, '0'))::CHAR(11),
        'customer' || lpad(i::TEXT, 2, '0') || '@payflow.test',
        'CUSTOMER'::user_role,
        CASE WHEN i <= 10 THEN 'ACTIVE'::user_status ELSE 'PENDING'::user_status END
    FROM generate_series(1, 20) AS customers(i)
    UNION ALL
    SELECT
        'Demo Merchant ' || lpad(i::TEXT, 2, '0'),
        ('01710000' || lpad((200 + i)::TEXT, 3, '0'))::CHAR(11),
        'merchant' || lpad(i::TEXT, 2, '0') || '@payflow.test',
        'MERCHANT'::user_role,
        'ACTIVE'::user_status
    FROM generate_series(1, 5) AS merchants(i)
) AS seed
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                '01710000999'::CHAR(11) AS mobile,
                'admin@payflow.test'::VARCHAR AS email,
                'ADMIN'::user_role AS role
            UNION ALL
            SELECT
                ('01710000' || lpad(i::TEXT, 3, '0'))::CHAR(11),
                'agent' || lpad(i::TEXT, 2, '0') || '@payflow.test',
                'AGENT'::user_role
            FROM generate_series(1, 3) AS agents(i)
            UNION ALL
            SELECT
                ('01710000' || lpad((100 + i)::TEXT, 3, '0'))::CHAR(11),
                'customer' || lpad(i::TEXT, 2, '0') || '@payflow.test',
                'CUSTOMER'::user_role
            FROM generate_series(1, 20) AS customers(i)
            UNION ALL
            SELECT
                ('01710000' || lpad((200 + i)::TEXT, 3, '0'))::CHAR(11),
                'merchant' || lpad(i::TEXT, 2, '0') || '@payflow.test',
                'MERCHANT'::user_role
            FROM generate_series(1, 5) AS merchants(i)
        ) AS expected
        LEFT JOIN users ON users.email = expected.email
        WHERE users.id IS NULL
           OR users.mobile <> expected.mobile
           OR users.role <> expected.role
    ) THEN
        RAISE EXCEPTION 'Existing demo seed users do not match the expected identities';
    END IF;
END
$$;

INSERT INTO wallets (user_id)
SELECT users.id
FROM users
WHERE users.email = 'admin@payflow.test'
   OR users.email LIKE 'agent%@payflow.test'
   OR users.email LIKE 'customer%@payflow.test'
   OR users.email LIKE 'merchant%@payflow.test'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO wallets (kind)
SELECT 'TREASURY'
WHERE NOT EXISTS (
    SELECT 1
    FROM wallets
    WHERE kind = 'TREASURY'
);

DO $$
DECLARE
    operation record;
    transaction_id BIGINT;
    from_wallet BIGINT;
    to_wallet BIGINT;
    from_balance NUMERIC(14,2);
    to_balance NUMERIC(14,2);
BEGIN
    FOR operation IN
        SELECT
            allocation.reference,
            'ALLOCATION'::txn_type AS transaction_type,
            NULL::VARCHAR AS from_email,
            allocation.to_email,
            allocation.amount,
            'admin@payflow.test'::VARCHAR AS actor_email,
            'Seed allocation to ' || allocation.to_email AS note
        FROM (
            VALUES
                ('PF-20261105-00000001', 'agent01@payflow.test', 50000.00::NUMERIC(14,2)),
                ('PF-20261105-00000002', 'agent02@payflow.test', 80000.00::NUMERIC(14,2)),
                ('PF-20261105-00000003', 'agent03@payflow.test', 70000.00::NUMERIC(14,2))
        ) AS allocation(reference, to_email, amount)

        UNION ALL

        SELECT
            'PF-20261105-' || lpad((100 + row_number() OVER (ORDER BY recipient.email))::TEXT, 8, '0'),
            'SEND_MONEY'::txn_type,
            CASE
                WHEN recipient.role = 'CUSTOMER' AND recipient.number <= 3
                  OR recipient.role = 'MERCHANT' AND recipient.number = 1
                    THEN 'agent01@payflow.test'
                WHEN recipient.role = 'CUSTOMER' AND recipient.number <= 7
                  OR recipient.role = 'MERCHANT' AND recipient.number <= 3
                    THEN 'agent02@payflow.test'
                ELSE 'agent03@payflow.test'
            END,
            recipient.email,
            CASE
                WHEN recipient.role = 'CUSTOMER' THEN 10000.00::NUMERIC(14,2)
                ELSE 20000.00::NUMERIC(14,2)
            END,
            CASE
                WHEN recipient.role = 'CUSTOMER' AND recipient.number <= 3
                  OR recipient.role = 'MERCHANT' AND recipient.number = 1
                    THEN 'agent01@payflow.test'
                WHEN recipient.role = 'CUSTOMER' AND recipient.number <= 7
                  OR recipient.role = 'MERCHANT' AND recipient.number <= 3
                    THEN 'agent02@payflow.test'
                ELSE 'agent03@payflow.test'
            END,
            'Seed transfer to ' || recipient.email
        FROM (
            SELECT
                email,
                role,
                substring(email FROM '[0-9]+')::INTEGER AS number
            FROM users
            WHERE (email LIKE 'customer%@payflow.test' AND status = 'ACTIVE')
               OR email LIKE 'merchant%@payflow.test'
        ) AS recipient
        ORDER BY 1
    LOOP
        IF operation.from_email IS NULL THEN
            SELECT id
            INTO from_wallet
            FROM wallets
            WHERE kind = 'TREASURY';
        ELSE
            SELECT wallets.id
            INTO from_wallet
            FROM wallets
            JOIN users ON users.id = wallets.user_id
            WHERE users.email = operation.from_email;
        END IF;

        SELECT wallets.id
        INTO to_wallet
        FROM wallets
        JOIN users ON users.id = wallets.user_id
        WHERE users.email = operation.to_email;

        IF from_wallet IS NULL OR to_wallet IS NULL THEN
            RAISE EXCEPTION 'Missing wallet for seed operation %', operation.reference;
        END IF;

        INSERT INTO transactions (
            reference,
            type,
            status,
            amount,
            from_wallet_id,
            to_wallet_id,
            initiated_by,
            note,
            completed_at
        )
        SELECT
            operation.reference,
            operation.transaction_type,
            'COMPLETED',
            operation.amount,
            from_wallet,
            to_wallet,
            users.id,
            operation.note,
            now()
        FROM users
        WHERE users.email = operation.actor_email
        ON CONFLICT (reference) DO NOTHING
        RETURNING id INTO transaction_id;

        IF transaction_id IS NULL THEN
            CONTINUE;
        END IF;

        UPDATE wallets
        SET balance = balance - operation.amount,
            version = version + 1
        WHERE id = from_wallet
          AND (kind = 'TREASURY' OR balance >= operation.amount)
        RETURNING balance INTO from_balance;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient funds for seed operation %', operation.reference;
        END IF;

        UPDATE wallets
        SET balance = balance + operation.amount,
            version = version + 1
        WHERE id = to_wallet
        RETURNING balance INTO to_balance;

        INSERT INTO ledger_entries (transaction_id, wallet_id, amount, balance_after)
        VALUES
            (transaction_id, from_wallet, -operation.amount, from_balance),
            (transaction_id, to_wallet, operation.amount, to_balance);
    END LOOP;
END
$$;

DO $$
BEGIN
    IF (
        SELECT count(*)
        FROM users
        WHERE email = 'admin@payflow.test'
           OR email LIKE 'agent%@payflow.test'
           OR email LIKE 'customer%@payflow.test'
           OR email LIKE 'merchant%@payflow.test'
    ) <> 29 THEN
        RAISE EXCEPTION 'Expected 29 demo users';
    END IF;

    IF (
        SELECT count(*)
        FROM transactions
        WHERE reference LIKE 'PF-20261105-000000%'
           OR reference LIKE 'PF-20261105-000001%'
    ) <> 18 THEN
        RAISE EXCEPTION 'Expected 18 demo transactions';
    END IF;

    IF EXISTS (
        SELECT transaction_id
        FROM ledger_entries
        WHERE transaction_id IN (
            SELECT id
            FROM transactions
            WHERE reference LIKE 'PF-20261105-000000%'
               OR reference LIKE 'PF-20261105-000001%'
        )
        GROUP BY transaction_id
        HAVING count(*) <> 2 OR sum(amount) <> 0
    ) THEN
        RAISE EXCEPTION 'Demo transaction ledger entries are not balanced';
    END IF;

    IF (
        SELECT count(*)
        FROM ledger_entries
        WHERE transaction_id IN (
            SELECT id
            FROM transactions
            WHERE reference LIKE 'PF-20261105-000000%'
               OR reference LIKE 'PF-20261105-000001%'
        )
    ) <> 36 THEN
        RAISE EXCEPTION 'Expected 36 demo ledger entries';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM wallets
        LEFT JOIN users ON users.id = wallets.user_id
        WHERE (
            wallets.kind = 'TREASURY'
            OR users.email = 'admin@payflow.test'
            OR users.email LIKE 'agent%@payflow.test'
            OR users.email LIKE 'customer%@payflow.test'
            OR users.email LIKE 'merchant%@payflow.test'
        )
        AND wallets.balance <> COALESCE(
            (SELECT sum(ledger_entries.amount)
             FROM ledger_entries
             WHERE ledger_entries.wallet_id = wallets.id),
            0
        )
    ) THEN
        RAISE EXCEPTION 'A demo user wallet balance does not reconcile with its ledger';
    END IF;
END
$$;

COMMIT;
