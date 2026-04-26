ALTER TABLE allowed_users ALTER COLUMN password DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM allowed_users WHERE email ilike 'ridan.rodva@gmail.com') THEN
    INSERT INTO allowed_users (email, role, name) 
    VALUES ('ridan.rodva@gmail.com', 'Administrador', 'Ridan Rodva');
  ELSE
    UPDATE allowed_users 
    SET role = 'Administrador' 
    WHERE email ilike 'ridan.rodva@gmail.com';
  END IF;
END
$$;
