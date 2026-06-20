CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');

ALTER TABLE users
  ADD COLUMN role user_role NOT NULL DEFAULT 'USER';

CREATE INDEX users_role_idx ON users (role) WHERE role = 'ADMIN';

COMMENT ON COLUMN users.role IS
  'Server-enforced authorization role. ADMIN grants access to the operations console.';
