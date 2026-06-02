-- PostgreSQL-style mixed fixture
CREATE TABLE public.pg_accounts (
  id bigserial NOT NULL,
  uuid uuid NOT NULL,
  email character varying(191) NOT NULL,
  settings jsonb,
  created_at timestamp with time zone NULL,
  updated_at timestamp with time zone NULL,
  deleted_at timestamp with time zone NULL
);

ALTER TABLE ONLY public.pg_accounts
  ADD CONSTRAINT pg_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pg_accounts
  ADD CONSTRAINT pg_accounts_uuid_unique UNIQUE (uuid);

CREATE TABLE public.pg_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  account_id bigint NOT NULL,
  event_name character varying(120) NOT NULL,
  search_vector tsvector,
  client_ip inet,
  device_mac macaddr,
  region geography,
  embedding vector(1536),
  created_at timestamp with time zone NULL,
  updated_at timestamp with time zone NULL
);

ALTER TABLE ONLY public.pg_events
  ADD CONSTRAINT pg_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pg_events
  ADD CONSTRAINT pg_events_account_id_foreign FOREIGN KEY (account_id) REFERENCES public.pg_accounts(id) ON DELETE CASCADE;

COMMIT;
