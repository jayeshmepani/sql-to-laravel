SET statement_timeout = 0;
START TRANSACTION;

CREATE TABLE public.cix_accounts (
  id bigserial NOT NULL,
  email character varying(190) NOT NULL,
  created_at timestamp with time zone NULL,
  updated_at timestamp with time zone NULL
);

ALTER TABLE ONLY public.cix_accounts
  ADD CONSTRAINT cix_accounts_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX cix_accounts_email_unique
  ON public.cix_accounts (email);

CREATE TABLE sq_notes (
  id integer NOT NULL,
  account_id integer,
  slug varchar(80) NOT NULL,
  metadata json,
  created_at datetime,
  updated_at datetime
);

ALTER TABLE sq_notes
  ADD PRIMARY KEY (id);

CREATE INDEX sq_notes_account_id_index
  ON sq_notes (account_id);

CREATE UNIQUE INDEX IF NOT EXISTS sq_notes_slug_unique
  ON sq_notes (slug);

DROP INDEX sq_notes_account_id_index ON sq_notes;

CREATE TABLE public.cix_drop_probe (
  id bigserial NOT NULL,
  slug character varying(70) NOT NULL
);

ALTER TABLE ONLY public.cix_drop_probe
  ADD CONSTRAINT cix_drop_probe_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX cix_drop_probe_slug_unique
  ON public.cix_drop_probe (slug);

DROP INDEX cix_drop_probe_slug_unique;

COMMIT;
