-- FlashCast analytics schema (spec 2.4).
--
-- impressions_local  : ReplicatedMergeTree, one per node, holds that node's shard.
-- impressions        : Distributed table the application reads and writes through.
--                      Writes are sharded across nodes; reads fan out and merge.
--
-- Runs on every node at first start via docker-entrypoint-initdb.d. The
-- ON CLUSTER clause makes each statement propagate through Keeper, so running it
-- twice is harmless.

CREATE TABLE IF NOT EXISTS default.impressions_local ON CLUSTER flashcast_cluster
(
    campaign_id Int32,
    cost        Float64,
    status      String,
    created_at  DateTime DEFAULT now()
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{cluster}/{shard}/impressions', '{replica}')
ORDER BY created_at;

CREATE TABLE IF NOT EXISTS default.impressions ON CLUSTER flashcast_cluster
AS default.impressions_local
ENGINE = Distributed(flashcast_cluster, default, impressions_local, rand());
