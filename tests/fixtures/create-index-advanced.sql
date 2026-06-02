CREATE TABLE public.cix_searches (
  id bigserial NOT NULL,
  email character varying(190) NOT NULL,
  deleted_at timestamp with time zone NULL,
  created_at timestamp with time zone NULL,
  updated_at timestamp with time zone NULL
);

ALTER TABLE ONLY public.cix_searches
  ADD CONSTRAINT cix_searches_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX cix_searches_email_live_unique
  ON public.cix_searches (lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX cix_searches_tsv_idx
  ON public.cix_searches USING gin (to_tsvector('english', coalesce(email, '')));

DROP INDEX cix_searches_tsv_idx;

COMMIT;
