import type { DatabaseSync } from "node:sqlite";
import { stableId } from "../utils/ids.js";
import { normalizeWhitespace, stripLeadingExperienceInjection, stripLeadingTimestampTag } from "../utils/text.js";

type WarningNodeRow = {
  id: string;
  node_type: string;
  scope_id: string;
  task_type: string;
  trigger_pattern: string;
  applicability_notes: string | null;
  env_signature: string | null;
  compact_hint: string;
  goal: string | null;
  recommended_steps_json: string | null;
  avoid_steps_json: string | null;
  fallback_steps_json: string | null;
  success_signal: string;
  stop_condition: string | null;
  escalation_condition: string | null;
  evidence_summary: string;
  source_kind: string;
  state: string;
  usage_count: number;
  helped_count: number;
  harmed_count: number;
  support_count: number;
  last_used_at: string | null;
  last_helped_at: string | null;
  last_harmed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CleanupSummary = {
  canonicalizedGroups: number;
  retiredVariants: number;
  createdCanonicalNodes: number;
};

const STATE_WEIGHT: Record<string, number> = {
  active: 3,
  cooling: 2,
  candidate: 1,
  retired: 0
};

export const canonicalWarningHint =
  "Do not keep iterating on the current debug path without narrowing the failing signature first.";

export const cleanWarningTriggerPattern = (value: string): string =>
  normalizeWhitespace(stripLeadingTimestampTag(stripLeadingExperienceInjection(value)));

const compareIso = (left?: string | null, right?: string | null): string | null => {
  if (!left) {
    return right ?? null;
  }

  if (!right) {
    return left;
  }

  return left >= right ? left : right;
};

const chooseState = (rows: WarningNodeRow[]): string =>
  [...rows].sort((left, right) => (STATE_WEIGHT[right.state] ?? 0) - (STATE_WEIGHT[left.state] ?? 0))[0]?.state ??
  "retired";

const choosePrimaryRow = (rows: WarningNodeRow[]): WarningNodeRow =>
  [...rows].sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0]!;

const chooseCanonicalTriggerPattern = (rows: WarningNodeRow[]): string => {
  for (const row of [...rows].sort((left, right) => right.updated_at.localeCompare(left.updated_at))) {
    const cleaned = cleanWarningTriggerPattern(row.trigger_pattern);
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
};

const buildCanonicalId = (row: WarningNodeRow): string =>
  stableId("node", [row.scope_id, row.task_type, "warning", canonicalWarningHint].join(":"));

const parseJsonArray = (value: string | null): string =>
  value && value.trim() ? value : "[]";

export const cleanupHistoricalWarningVariants = (
  db: DatabaseSync,
  apply = false
): CleanupSummary => {
  const rows = db
    .prepare(
      `SELECT * FROM experience_nodes
       WHERE node_type = 'warning' AND state IN ('active', 'candidate', 'cooling')
       ORDER BY updated_at DESC`
    )
    .all() as WarningNodeRow[];

  const groups = new Map<string, WarningNodeRow[]>();
  for (const row of rows) {
    const canonicalId = buildCanonicalId(row);
    const group = groups.get(canonicalId) ?? [];
    group.push(row);
    groups.set(canonicalId, group);
  }

  let canonicalizedGroups = 0;
  let retiredVariants = 0;
  let createdCanonicalNodes = 0;

  for (const [canonicalId, group] of groups) {
    const needsCleanup = group.some((row) => row.id !== canonicalId || row.compact_hint !== canonicalWarningHint);
    if (!needsCleanup) {
      continue;
    }

    canonicalizedGroups += 1;

    const primary = choosePrimaryRow(group);
    const canonicalRow = group.find((row) => row.id === canonicalId);
    const merged = {
      id: canonicalId,
      node_type: "warning",
      scope_id: primary.scope_id,
      task_type: primary.task_type,
      trigger_pattern: chooseCanonicalTriggerPattern(group),
      applicability_notes: primary.applicability_notes,
      env_signature: primary.env_signature,
      compact_hint: canonicalWarningHint,
      goal: primary.goal,
      recommended_steps_json: parseJsonArray(primary.recommended_steps_json),
      avoid_steps_json: parseJsonArray(primary.avoid_steps_json),
      fallback_steps_json: parseJsonArray(primary.fallback_steps_json),
      success_signal: primary.success_signal,
      stop_condition: primary.stop_condition,
      escalation_condition: primary.escalation_condition,
      evidence_summary: primary.evidence_summary,
      source_kind: primary.source_kind,
      state: chooseState(group),
      usage_count: group.reduce((sum, row) => sum + row.usage_count, 0),
      helped_count: group.reduce((sum, row) => sum + row.helped_count, 0),
      harmed_count: group.reduce((sum, row) => sum + row.harmed_count, 0),
      support_count: group.reduce((sum, row) => sum + row.support_count, 0),
      last_used_at: group.reduce<string | null>((latest, row) => compareIso(latest, row.last_used_at), null),
      last_helped_at: group.reduce<string | null>((latest, row) => compareIso(latest, row.last_helped_at), null),
      last_harmed_at: group.reduce<string | null>((latest, row) => compareIso(latest, row.last_harmed_at), null),
      created_at: [...group].sort((left, right) => left.created_at.localeCompare(right.created_at))[0]!.created_at,
      updated_at: primary.updated_at
    };

    if (!canonicalRow) {
      createdCanonicalNodes += 1;
    }

    retiredVariants += group.filter((row) => row.id !== canonicalId).length;

    if (!apply) {
      continue;
    }

    db.prepare(
      `INSERT INTO experience_nodes
        (id, node_type, scope_id, task_type, trigger_pattern, applicability_notes, env_signature, compact_hint, goal,
         recommended_steps_json, avoid_steps_json, fallback_steps_json, success_signal, stop_condition, escalation_condition,
         evidence_summary, source_kind, state, usage_count, helped_count, harmed_count, support_count, last_used_at,
         last_helped_at, last_harmed_at, created_at, updated_at)
       VALUES
        (@id, @node_type, @scope_id, @task_type, @trigger_pattern, @applicability_notes, @env_signature, @compact_hint, @goal,
         @recommended_steps_json, @avoid_steps_json, @fallback_steps_json, @success_signal, @stop_condition, @escalation_condition,
         @evidence_summary, @source_kind, @state, @usage_count, @helped_count, @harmed_count, @support_count, @last_used_at,
         @last_helped_at, @last_harmed_at, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
        trigger_pattern = excluded.trigger_pattern,
        applicability_notes = excluded.applicability_notes,
        env_signature = excluded.env_signature,
        compact_hint = excluded.compact_hint,
        goal = excluded.goal,
        recommended_steps_json = excluded.recommended_steps_json,
        avoid_steps_json = excluded.avoid_steps_json,
        fallback_steps_json = excluded.fallback_steps_json,
        success_signal = excluded.success_signal,
        stop_condition = excluded.stop_condition,
        escalation_condition = excluded.escalation_condition,
        evidence_summary = excluded.evidence_summary,
        source_kind = excluded.source_kind,
        state = excluded.state,
        usage_count = excluded.usage_count,
        helped_count = excluded.helped_count,
        harmed_count = excluded.harmed_count,
        support_count = excluded.support_count,
        last_used_at = excluded.last_used_at,
        last_helped_at = excluded.last_helped_at,
        last_harmed_at = excluded.last_harmed_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`
    ).run(merged);

    if (group.some((row) => row.id !== canonicalId)) {
      const ids = group.filter((row) => row.id !== canonicalId).map((row) => row.id);
      const placeholders = ids.map(() => "?").join(", ");
      db.prepare(`UPDATE experience_nodes SET state = 'retired' WHERE id IN (${placeholders})`).run(...ids);
    }
  }

  return {
    canonicalizedGroups,
    retiredVariants,
    createdCanonicalNodes
  };
};
