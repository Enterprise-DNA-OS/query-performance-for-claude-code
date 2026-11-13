CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE FUNCTION immutable_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evidence is append-only'; END $$;
CREATE TABLE sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK(btrim(name)<>''), owner text NOT NULL CHECK(btrim(owner)<>''), purpose text NOT NULL CHECK(btrim(purpose)<>''), access_review date NOT NULL, retention_review date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE hosts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES sources(id), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,name));
CREATE TABLE queries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), host_id uuid NOT NULL REFERENCES hosts(id), db_name text NOT NULL, db_user text NOT NULL, signature text NOT NULL, owner text, label text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(host_id,db_name,db_user,signature));
CREATE TABLE imports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES sources(id),digest text NOT NULL, source_ref text NOT NULL,actor text NOT NULL,raw jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,digest));
CREATE TABLE observations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),query_id uuid NOT NULL REFERENCES queries(id),import_id uuid NOT NULL REFERENCES imports(id),window_start timestamptz NOT NULL,window_end timestamptz NOT NULL, executions numeric NOT NULL CHECK(executions>=0),total_ns numeric NOT NULL CHECK(total_ns>=0), paired_points integer NOT NULL CHECK(paired_points>=0), missing_points integer NOT NULL CHECK(missing_points>=0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(window_end>window_start), UNIQUE(query_id,window_start,window_end));
CREATE TABLE actions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),query_id uuid NOT NULL REFERENCES queries(id),title text NOT NULL CHECK(btrim(title)<>''),owner text NOT NULL CHECK(btrim(owner)<>''),due date NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed')),closure_evidence text,closed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(), CHECK((status='open' AND closed_at IS NULL AND closure_evidence IS NULL) OR (status='closed' AND closed_at IS NOT NULL AND btrim(closure_evidence)<>'')));
CREATE TABLE notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),query_id uuid NOT NULL REFERENCES queries(id),body text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL,record_id uuid NOT NULL,actor text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE sources ENABLE ROW LEVEL SECURITY; REVOKE ALL ON sources FROM PUBLIC;
CREATE TRIGGER touch_sources BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY; REVOKE ALL ON hosts FROM PUBLIC;
CREATE TRIGGER touch_hosts BEFORE UPDATE ON hosts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE queries ENABLE ROW LEVEL SECURITY; REVOKE ALL ON queries FROM PUBLIC;
CREATE TRIGGER touch_queries BEFORE UPDATE ON queries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE imports ENABLE ROW LEVEL SECURITY; REVOKE ALL ON imports FROM PUBLIC;
CREATE TRIGGER touch_imports BEFORE UPDATE ON imports FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE observations ENABLE ROW LEVEL SECURITY; REVOKE ALL ON observations FROM PUBLIC;
CREATE TRIGGER touch_observations BEFORE UPDATE ON observations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE actions ENABLE ROW LEVEL SECURITY; REVOKE ALL ON actions FROM PUBLIC;
CREATE TRIGGER touch_actions BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE notes ENABLE ROW LEVEL SECURITY; REVOKE ALL ON notes FROM PUBLIC;
CREATE TRIGGER touch_notes BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE events ENABLE ROW LEVEL SECURITY; REVOKE ALL ON events FROM PUBLIC;
CREATE TRIGGER touch_events BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER immutable_imports BEFORE UPDATE OR DELETE ON imports FOR EACH ROW EXECUTE FUNCTION immutable_evidence();
CREATE TRIGGER immutable_observations BEFORE UPDATE OR DELETE ON observations FOR EACH ROW EXECUTE FUNCTION immutable_evidence();
CREATE TRIGGER immutable_notes BEFORE UPDATE OR DELETE ON notes FOR EACH ROW EXECUTE FUNCTION immutable_evidence();
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION immutable_evidence();

CREATE VIEW query_windows AS SELECT o.*,s.name AS source,h.name AS host,q.db_name,q.db_user,q.signature,coalesce(q.label,q.signature) AS query_name,q.owner,
CASE WHEN missing_points=0 AND executions>0 THEN round(total_ns/executions/1000000,3) END AS mean_ms,
round(total_ns/1000000000,3) AS observed_seconds
FROM observations o JOIN queries q ON q.id=o.query_id JOIN hosts h ON h.id=q.host_id JOIN sources s ON s.id=h.source_id;
CREATE VIEW latest_queries AS SELECT * FROM (SELECT w.*,row_number() OVER(PARTITION BY query_id ORDER BY window_end DESC) AS position FROM query_windows w) x WHERE position=1;
CREATE VIEW regressions AS WITH previous AS (SELECT w.*,lag(mean_ms) OVER(PARTITION BY query_id ORDER BY window_end) AS previous_ms,lag(window_end-window_start) OVER(PARTITION BY query_id ORDER BY window_end) AS previous_duration FROM query_windows w)
SELECT query_id,source,host,query_name,owner,window_start,window_end,previous_ms,mean_ms,CASE WHEN previous_duration=window_end-window_start AND previous_ms>0 AND mean_ms IS NOT NULL THEN round(100*(mean_ms/previous_ms-1),1) END AS change_pct FROM previous;
CREATE VIEW action_queue AS SELECT a.*,coalesce(q.label,q.signature) AS query_name,h.name AS host,s.name AS source,(a.status='open' AND a.due<current_date) AS overdue FROM actions a JOIN queries q ON q.id=a.query_id JOIN hosts h ON h.id=q.host_id JOIN sources s ON s.id=h.source_id;
CREATE VIEW compliance_findings AS
SELECT 'access-review'::text AS rule,id AS record_id,name AS record,owner,'Review source access and record the outcome'::text AS finding FROM sources WHERE access_review<current_date
UNION ALL SELECT 'retention-review',id,name,owner,'Review whether retained evidence is still necessary' FROM sources WHERE retention_review<current_date
UNION ALL SELECT 'query-owner',id,coalesce(label,signature),owner,'Assign an accountable tuning owner' FROM queries WHERE owner IS NULL OR btrim(owner)=''
UNION ALL SELECT 'incomplete-evidence',query_id,query_name,owner,'Missing paired samples; mean latency is withheld' FROM latest_queries WHERE missing_points>0
UNION ALL SELECT 'stale-evidence',query_id,query_name,owner,'Latest exported window is over seven days old' FROM latest_queries WHERE window_end<now()-interval '7 days';
REVOKE ALL ON query_windows,latest_queries,regressions,action_queue,compliance_findings FROM PUBLIC;
