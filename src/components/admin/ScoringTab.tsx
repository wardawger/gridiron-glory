import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import type { League, ScoringSettings, StatBonusCategorySettings, CfbTeam } from '../../types';
import { normalizeScoring, STAT_BONUS_CATEGORIES, STAT_BONUS_LABELS, BONUS_GROUPS, BONUS_LABELS } from '../../types';
import { useCrossfadeVisibility } from '../../hooks/useCrossfade';
import { Toggle } from '../ui/Toggle';
import { Toast } from '../ui/Toast';
import { ScoreField } from './ScoreField';

interface Props {
  league: League;
  teams: CfbTeam[];
  onUpdateScoring: (s: ScoringSettings) => Promise<{ error?: string } | void>;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TOAST_DURATION_MS = 3000;

// Statistical rankings get their own dedicated, auto-calculating editor
// below ("Statistical Ranking Bonuses") — excluded here so a commissioner
// isn't shown two different places to set the same point values.
const postseasonGroups = BONUS_GROUPS.filter(g => !g.label.startsWith('Statistical Rankings'));

// A labelled on/off row: text on the left, Toggle on the right. Wrapping a
// <button> in a <label> is invalid HTML and doesn't associate anything, so
// this pairs the visible state text with the switch via aria-describedby
// and gives the switch a real accessible name.
function SwitchRow({ id, name, checked, onChange, onText = 'Enabled', offText = 'Disabled' }: {
  id: string; name: string; checked: boolean; onChange: () => void; onText?: string; offText?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span id={`${id}-state`} className="text-xs text-turf-400">{checked ? onText : offText}</span>
      <Toggle id={id} checked={checked} onChange={onChange} label={name} />
    </div>
  );
}

// Two-option segmented control (radio semantics).
function Segmented<T extends string>({ labelledBy, value, options, onChange }: {
  labelledBy: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400 ${
            value === o.value ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white hover:border-turf-600'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ScoringTab({ league, teams, onUpdateScoring }: Props) {
  const uid = useId();
  const [scoring, _setScoring] = useState<ScoringSettings>(normalizeScoring(league.scoring));
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Local edits vs. the league's saved settings. `dirty` gates two things:
  // (1) an incoming league.scoring change (another commissioner saved, or
  // realtime caught up) resyncs the form only while it has no local edits,
  // so a concurrent save is never silently overwritten by stale local
  // state; (2) a beforeunload warning while edits are unsaved.
  const [dirty, setDirty] = useState(false);
  const setScoring = (fn: (prev: ScoringSettings) => ScoringSettings) => {
    setDirty(true);
    _setScoring(fn);
  };
  useEffect(() => {
    if (!dirty) _setScoring(normalizeScoring(league.scoring));
  }, [league.scoring]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Live conference list, not hardcoded — avoids the exact kind of drift the
  // P4 conference list itself once had before it was consolidated.
  const allConferences = useMemo(
    () => Array.from(new Set(teams.map(t => t.conference))).sort(),
    [teams]
  );

  const toggleExcludedConference = (conference: string) => {
    setScoring(prev => ({
      ...prev,
      excluded_conferences: prev.excluded_conferences.includes(conference)
        ? prev.excluded_conferences.filter(c => c !== conference)
        : [...prev.excluded_conferences, conference],
    }));
  };

  const statBonusPanel  = useCrossfadeVisibility(scoring.stat_bonus_enabled);
  const spreadPanel     = useCrossfadeVisibility(scoring.spread_enabled);
  const freeAgencyPanel = useCrossfadeVisibility(scoring.free_agency_enabled);
  const waiverPanel     = useCrossfadeVisibility(scoring.waiver_enabled);
  const benchPanel      = useCrossfadeVisibility(scoring.bench_enabled);

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
  }, []);

  const handleSaveScoring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (scoring.bench_enabled && scoring.starters_count + scoring.bench_count !== league.max_teams_per_user) {
      setSaveError(`Starters + Bench must total ${league.max_teams_per_user} (this league’s teams per player). Adjust the Bench section and save again.`);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (scoring.captain_min_per_week > scoring.captain_max_per_week) {
      setSaveError('Min captains per week cannot be more than the maximum. Adjust the Captain Scoring section and save again.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setSaveError('');
    setSaving(true);

    // Changing the weekly minimum baselines it to the current week, so a
    // stricter rule never retroactively forfeits a week already played.
    const saved = normalizeScoring(league.scoring);
    const next: ScoringSettings = { ...scoring };
    if (next.captain_min_per_week !== saved.captain_min_per_week) {
      next.captain_min_effective_week = league.current_week;
    }
    const result = await onUpdateScoring(next);
    setSaving(false);
    if (result && 'error' in result && result.error) {
      setSaveError(`Couldn’t save: ${result.error}. Try again.`);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setDirty(false);
    setShowSavedToast(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setShowSavedToast(false), TOAST_DURATION_MS);
  };

  const selectCls = 'input [&>option]:bg-turf-800 [&>option]:text-white';

  return (
    <form onSubmit={handleSaveScoring} className="space-y-4" noValidate>
      {/* Roster conference limits */}
      <div className="card p-5 space-y-4">
        <h3 className="font-medium text-white text-sm">Roster Conference Limits</h3>
        <p className="text-xs text-turf-400">Applies during the draft and to portal/waiver moves.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
          <ScoreField label="P4 Min (per conference)" min={0} value={scoring.p4_conf_min} onChange={v => setScoring(prev => ({ ...prev, p4_conf_min: v }))} />
          <ScoreField label="P4 Max (per conference)" min={1} value={scoring.p4_conf_max} onChange={v => setScoring(prev => ({ ...prev, p4_conf_max: v }))} />
          <ScoreField label="G5 Min (combined)" min={0} value={scoring.g5_conf_min} onChange={v => setScoring(prev => ({ ...prev, g5_conf_min: v }))} />
          <ScoreField label="G5 Max (combined)" min={1} value={scoring.g5_conf_max} onChange={v => setScoring(prev => ({ ...prev, g5_conf_max: v }))} />
        </div>
        <p className="text-xs text-turf-500">
          P4 = SEC, Big Ten, Big 12, ACC — each conference is capped separately. G5/non-P4 teams share one combined limit.
        </p>
      </div>

      {/* Excluded conferences */}
      <div className="card p-5 space-y-3">
        <h3 className="font-medium text-white text-sm" id={`${uid}-excl`}>Excluded Conferences</h3>
        <p className="text-xs text-turf-400">
          Teams from checked conferences can’t be drafted or picked up via the portal/waivers.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-labelledby={`${uid}-excl`}>
          {allConferences.map(conference => {
            const excluded = scoring.excluded_conferences.includes(conference);
            return (
              <button
                key={conference}
                type="button"
                onClick={() => toggleExcludedConference(conference)}
                aria-pressed={excluded}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400 ${
                  excluded
                    ? 'border-red-800 bg-red-950/30 text-red-300'
                    : 'border-turf-700 text-turf-300 hover:border-turf-600 hover:bg-turf-800/40'
                }`}
              >
                <span className="truncate">{conference}</span>
                {excluded && <span className="text-xs uppercase tracking-wide flex-shrink-0">Excluded</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Base scoring */}
      <div className="card p-5 space-y-4">
        <h3 className="font-medium text-white text-sm">Base Scoring</h3>
        <p className="text-xs text-turf-400">Adjust scoring settings for this league. Changes apply to all weeks.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
          {(['win', 'win_ranked', 'win_top15', 'win_top5', 'loss', 'loss_g5'] as const).map(key => {
            const labels: Record<string, string> = {
              win: 'Win', win_ranked: 'Beat Ranked', win_top15: 'Beat Top 15',
              win_top5: 'Beat Top 5', loss: 'Loss', loss_g5: 'Loss to G5',
            };
            return (
              <ScoreField
                key={key}
                label={labels[key]}
                step={0.5}
                value={scoring[key] as number}
                onChange={v => setScoring(prev => ({ ...prev, [key]: v }))}
              />
            );
          })}
        </div>
      </div>

      {/* Captain scoring */}
      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-medium text-white text-sm">Captain Scoring</h3>
          <p className="text-xs text-turf-400 mt-0.5">
            A captain multiplies that team’s points for one week. None of these apply
            retroactively: every pick keeps the multiplier it was made under, and a new weekly
            minimum only counts from the current week forward.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
          <ScoreField
            label="Captain Multiplier"
            min={1}
            value={scoring.captain_multiplier}
            onChange={v => setScoring(prev => ({ ...prev, captain_multiplier: Math.round(v) }))}
            description={`A captained team scores ${scoring.captain_multiplier}× its normal points`}
          />
          <ScoreField
            label="Max Weeks / Team / Season"
            min={1}
            value={scoring.captain_max_per_team_season}
            onChange={v => setScoring(prev => ({ ...prev, captain_max_per_team_season: Math.round(v) }))}
            description="How many times one team may be captained all season"
          />
          <ScoreField
            label="Min Captains / Week"
            min={0}
            value={scoring.captain_min_per_week}
            onChange={v => setScoring(prev => ({ ...prev, captain_min_per_week: Math.round(v) }))}
            description="0 = no minimum. Set fewer than this and that week’s captain bonuses are forfeited."
          />
          <ScoreField
            label="Max Captains / Week"
            min={1}
            value={scoring.captain_max_per_week}
            onChange={v => setScoring(prev => ({ ...prev, captain_max_per_week: Math.round(v) }))}
            description="Above 1, a manager may captain several teams in the same week"
          />
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-turf-800">
          <div>
            <p className="text-sm text-white">Require Every Team To Be Captained</p>
            <p className="text-xs text-turf-500 mt-0.5">
              Shows each manager which of their teams has never been captained. Advisory only — it
              does not block picks or change scoring.
            </p>
          </div>
          <SwitchRow
            id={`${uid}-cap-all`}
            name="Require every team to be captained"
            checked={scoring.captain_require_all_teams}
            onChange={() => setScoring(prev => ({ ...prev, captain_require_all_teams: !prev.captain_require_all_teams }))}
          />
        </div>
      </div>

      {/* Postseason bonus points */}
      <div className="card p-5 space-y-4">
        <h3 className="font-medium text-white text-sm">Postseason Bonus Points</h3>
        <p className="text-xs text-turf-400">
          Starting point values for manually-awarded bonuses (Admin → Adjustments). Each award can still be edited individually when given.
        </p>
        <div className="space-y-4">
          {postseasonGroups.map(group => (
            <div key={group.label} className="space-y-2">
              <p className="text-xs font-medium text-turf-300 uppercase tracking-wide">{group.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-3">
                {group.types.map(type => (
                  <ScoreField
                    key={type}
                    label={BONUS_LABELS[type]}
                    variant="compact"
                    step={0.5}
                    value={scoring.bonus_points[type]}
                    onChange={v => setScoring(prev => ({
                      ...prev,
                      bonus_points: { ...prev.bonus_points, [type]: v },
                    }))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statistical ranking bonus settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-white text-sm">Statistical Ranking Bonuses</h3>
            <p className="text-xs text-turf-400 mt-0.5">
              Award points to whoever owns a top- or bottom-ranked team in each category
              (among all drafted teams). Shown as a live preview until conference championship
              week, then locks in.
            </p>
          </div>
          <SwitchRow id={`${uid}-stat`} name="Statistical ranking bonuses enabled" checked={scoring.stat_bonus_enabled} onChange={() => setScoring(prev => ({ ...prev, stat_bonus_enabled: !prev.stat_bonus_enabled }))} />
        </div>

        {statBonusPanel.shown && (
          <div className={`space-y-3 pt-2 border-t border-turf-800 ${statBonusPanel.className} motion-reduce:animate-none`}>
            {STAT_BONUS_CATEGORIES.map(cat => {
              const c = scoring.stat_bonus_categories[cat];
              const updateCat = (patch: Partial<StatBonusCategorySettings>) =>
                setScoring(prev => ({
                  ...prev,
                  stat_bonus_categories: {
                    ...prev.stat_bonus_categories,
                    [cat]: { ...prev.stat_bonus_categories[cat], ...patch },
                  },
                }));

              return (
                <div key={cat} className="card-inner p-3 space-y-3">
                  <p className="text-sm font-medium text-white">{STAT_BONUS_LABELS[cat]}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Top */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-turf-400 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-field-400" aria-hidden="true" /> Top Bonus
                        </span>
                        <Toggle
                          checked={c.top_enabled}
                          onChange={() => updateCat({ top_enabled: !c.top_enabled })}
                          label={`${STAT_BONUS_LABELS[cat]} top bonus enabled`}
                        />
                      </div>
                      {c.top_enabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-2">
                          <ScoreField label="# of Teams" variant="compact" min={1} value={c.top_count} onChange={v => updateCat({ top_count: v })} />
                          <ScoreField label="Points Each" variant="compact" step={0.5} value={c.top_points} onChange={v => updateCat({ top_points: v })} />
                        </div>
                      )}
                    </div>

                    {/* Bottom */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-turf-400 flex items-center gap-1">
                          <TrendingDown className="w-3 h-3 text-red-300" aria-hidden="true" /> Bottom Bonus
                        </span>
                        <Toggle
                          checked={c.bottom_enabled}
                          onChange={() => updateCat({ bottom_enabled: !c.bottom_enabled })}
                          label={`${STAT_BONUS_LABELS[cat]} bottom bonus enabled`}
                        />
                      </div>
                      {c.bottom_enabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-2">
                          <ScoreField label="# of Teams" variant="compact" min={1} value={c.bottom_count} onChange={v => updateCat({ bottom_count: v })} />
                          <ScoreField label="Points Each" variant="compact" step={0.5} description="Negative values subtract points" value={c.bottom_points} onChange={v => updateCat({ bottom_points: v })} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Spread betting settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-white text-sm">Spread Betting</h3>
            <p className="text-xs text-turf-400 mt-0.5">Users pick which teams will cover or beat the spread each week</p>
          </div>
          <SwitchRow id={`${uid}-spread`} name="Spread betting enabled" checked={scoring.spread_enabled} onChange={() => setScoring(prev => ({ ...prev, spread_enabled: !prev.spread_enabled }))} />
        </div>

        {spreadPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${spreadPanel.className} motion-reduce:animate-none`}>
            {/* Points mode toggle */}
            <div>
              <p className="label" id={`${uid}-mode`}>Point Mode</p>
              <Segmented
                labelledBy={`${uid}-mode`}
                value={scoring.spread_is_multiplier ? 'multiplier' : 'flat'}
                options={[{ value: 'flat', label: 'Flat Points' }, { value: 'multiplier', label: 'Multiplier' }]}
                onChange={v => setScoring(prev => ({ ...prev, spread_is_multiplier: v === 'multiplier' }))}
              />
              <p className="text-xs text-turf-500 mt-1">
                {scoring.spread_is_multiplier
                  ? 'Multiplier: earn a multiple of the base game points for covering'
                  : 'Flat: earn a set number of points for covering the spread'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
              <ScoreField
                label={scoring.spread_is_multiplier ? 'Multiplier (×)' : 'Points for Covering'}
                step={scoring.spread_is_multiplier ? 0.1 : 0.5}
                min={0}
                value={scoring.spread_points}
                onChange={v => setScoring(prev => ({ ...prev, spread_points: v }))}
                description={
                  <>Penalty for missing: {scoring.spread_miss_penalty_enabled
                    ? `−${scoring.spread_miss_penalty_points} pts (custom)`
                    : scoring.spread_is_multiplier ? `×${scoring.spread_points}` : `−${scoring.spread_points} pts`}</>
                }
              />
              <ScoreField label="Max Picks / Week" min={1} max={10} value={scoring.spread_max_per_week} onChange={v => setScoring(prev => ({ ...prev, spread_max_per_week: v }))} />
              <ScoreField label="Max Picks / Team / Season" min={1} max={20} value={scoring.spread_max_per_team} onChange={v => setScoring(prev => ({ ...prev, spread_max_per_team: v }))} />

              <div className="flex flex-col justify-end">
                <p className="label">Captain Stacking</p>
                <div className="flex items-center gap-2 mt-1">
                  <Toggle
                    id={`${uid}-stack`}
                    checked={scoring.spread_allow_captain_stack}
                    onChange={() => setScoring(prev => ({ ...prev, spread_allow_captain_stack: !prev.spread_allow_captain_stack }))}
                    label="Allow spread pick on the captain’s team"
                  />
                  <span className="text-xs text-turf-400">{scoring.spread_allow_captain_stack ? 'Allowed' : 'Not allowed'}</span>
                </div>
                <p className="text-xs text-turf-500 mt-0.5">Pick spread on captain’s team</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white">Against-the-Spread Picks</p>
                <p className="text-xs text-turf-500 mt-0.5">Let users pick a team to NOT cover the spread, not just to cover it. A push (exact tie against the line) always awards zero points either way.</p>
              </div>
              <SwitchRow id={`${uid}-against`} name="Against-the-spread picks allowed" onText="Allowed" offText="Cover only" checked={scoring.spread_allow_against_pick} onChange={() => setScoring(prev => ({ ...prev, spread_allow_against_pick: !prev.spread_allow_against_pick }))} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white">Miss Penalty</p>
                <p className="text-xs text-turf-500 mt-0.5">Override the points lost when a spread pick misses (defaults to the same amount as covering)</p>
              </div>
              <SwitchRow id={`${uid}-miss`} name="Custom miss penalty enabled" checked={scoring.spread_miss_penalty_enabled} onChange={() => setScoring(prev => ({ ...prev, spread_miss_penalty_enabled: !prev.spread_miss_penalty_enabled }))} />
            </div>

            {scoring.spread_miss_penalty_enabled && (
              <ScoreField
                label="Points for Missing"
                min={0}
                step={0.5}
                value={scoring.spread_miss_penalty_points}
                onChange={v => setScoring(prev => ({ ...prev, spread_miss_penalty_points: v }))}
                description={`−${scoring.spread_miss_penalty_points} pts applied whenever a spread pick misses, regardless of point mode`}
              />
            )}
          </div>
        )}
      </div>

      {/* Free agency settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-white text-sm">Portal</h3>
            <p className="text-xs text-turf-400 mt-0.5">Let managers drop a rostered team and add an available one</p>
          </div>
          <SwitchRow id={`${uid}-fa`} name="Portal enabled" checked={scoring.free_agency_enabled} onChange={() => setScoring(prev => ({ ...prev, free_agency_enabled: !prev.free_agency_enabled }))} />
        </div>

        {freeAgencyPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${freeAgencyPanel.className} motion-reduce:animate-none`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
              <ScoreField label="Max Adds/Drops / Season" min={0} value={scoring.fa_max_moves_per_season} onChange={v => setScoring(prev => ({ ...prev, fa_max_moves_per_season: v }))} />
              <ScoreField label="Max Adds/Drops / Week" min={0} value={scoring.fa_max_moves_per_week} onChange={v => setScoring(prev => ({ ...prev, fa_max_moves_per_week: v }))} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white">Point Penalty</p>
                <p className="text-xs text-turf-500 mt-0.5">Subtract points the week a swap is made</p>
              </div>
              <SwitchRow id={`${uid}-fa-pen`} name="Portal point penalty enabled" checked={scoring.fa_penalty_enabled} onChange={() => setScoring(prev => ({ ...prev, fa_penalty_enabled: !prev.fa_penalty_enabled }))} />
            </div>

            {scoring.fa_penalty_enabled && (
              <ScoreField
                label="Penalty Points"
                min={0}
                step={0.5}
                value={scoring.fa_penalty_points}
                onChange={v => setScoring(prev => ({ ...prev, fa_penalty_points: v }))}
                description={`−${scoring.fa_penalty_points} pts applied the week of each add/drop`}
              />
            )}
          </div>
        )}
      </div>

      {/* Waiver wire settings */}
      {scoring.free_agency_enabled && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-white text-sm">Waiver Wire</h3>
              <p className="text-xs text-turf-400 mt-0.5">Queue adds/drops as claims resolved on a set day, with priority for contested teams</p>
            </div>
            <SwitchRow id={`${uid}-waiver`} name="Waiver wire enabled" checked={scoring.waiver_enabled} onChange={() => setScoring(prev => ({ ...prev, waiver_enabled: !prev.waiver_enabled }))} />
          </div>

          {waiverPanel.shown && (
            <div className={`space-y-4 pt-2 border-t border-turf-800 ${waiverPanel.className} motion-reduce:animate-none`}>
              <div>
                <p className="label" id={`${uid}-prio`}>Priority Metric</p>
                <p className="text-xs text-turf-500 mb-2">Who wins when two managers claim the same team</p>
                <Segmented
                  labelledBy={`${uid}-prio`}
                  value={scoring.waiver_priority_metric}
                  options={[{ value: 'worst_record', label: 'Worst Record' }, { value: 'fewest_points', label: 'Fewest Points' }]}
                  onChange={v => setScoring(prev => ({ ...prev, waiver_priority_metric: v }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${uid}-day`} className="label">Processing Day</label>
                  <select
                    id={`${uid}-day`}
                    name="waiver_process_day"
                    className={selectCls}
                    value={scoring.waiver_process_day}
                    onChange={e => setScoring(prev => ({ ...prev, waiver_process_day: parseInt(e.target.value) }))}
                  >
                    {WEEKDAY_NAMES.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${uid}-tz`} className="label">League Timezone</label>
                  <select
                    id={`${uid}-tz`}
                    name="waiver_timezone"
                    className={selectCls}
                    value={scoring.waiver_timezone}
                    onChange={e => setScoring(prev => ({ ...prev, waiver_timezone: e.target.value }))}
                  >
                    <option value="America/New_York">Eastern</option>
                    <option value="America/Chicago">Central</option>
                    <option value="America/Denver">Mountain</option>
                    <option value="America/Los_Angeles">Pacific</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-turf-500">
                Claims are resolved at 9am local time on the selected day.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Starters / Bench settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-white text-sm">Bench</h3>
            <p className="text-xs text-turf-400 mt-0.5">Split each roster into starters (score that week) and bench (don’t). Locks per-team once its game kicks off.</p>
          </div>
          <SwitchRow id={`${uid}-bench`} name="Bench enabled" checked={scoring.bench_enabled} onChange={() => setScoring(prev => ({ ...prev, bench_enabled: !prev.bench_enabled }))} />
        </div>

        {benchPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${benchPanel.className} motion-reduce:animate-none`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
              <ScoreField label="Starters" min={1} value={scoring.starters_count} onChange={v => setScoring(prev => ({ ...prev, starters_count: v }))} />
              <ScoreField label="Bench" min={0} value={scoring.bench_count} onChange={v => setScoring(prev => ({ ...prev, bench_count: v }))} />
            </div>
            <p className="text-xs text-turf-500" aria-live="polite">
              Must total {league.max_teams_per_user} — this league’s teams per player. Currently {scoring.starters_count + scoring.bench_count}.
            </p>
          </div>
        )}
      </div>

      {saveError && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="text-sm bg-red-900/40 text-red-300 border border-red-800 rounded-lg px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          {saveError}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save Scoring Settings'}
        </button>
        <span className="text-xs text-turf-500" aria-live="polite">{dirty && !saving ? 'Unsaved changes' : ''}</span>
      </div>

      <Toast message="Scoring settings saved" show={showSavedToast} />
    </form>
  );
}
