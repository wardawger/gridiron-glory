import { useState, useRef, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { League, ScoringSettings, StatBonusCategorySettings, CfbTeam } from '../../types';
import { normalizeScoring, STAT_BONUS_CATEGORIES, STAT_BONUS_LABELS, BONUS_GROUPS, BONUS_LABELS } from '../../types';
import { useCrossfadeVisibility } from '../../hooks/useCrossfade';
import { Toggle } from '../ui/Toggle';
import { Toast } from '../ui/Toast';
import { ScoreField } from './ScoreField';

interface Props {
  league: League;
  teams: CfbTeam[];
  onUpdateScoring: (s: ScoringSettings) => void;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TOAST_DURATION_MS = 3000;

// Statistical rankings get their own dedicated, auto-calculating editor
// below ("Statistical Ranking Bonuses") — excluded here so a commissioner
// isn't shown two different places to set the same point values.
const postseasonGroups = BONUS_GROUPS.filter(g => !g.label.startsWith('Statistical Rankings'));

export function ScoringTab({ league, teams, onUpdateScoring }: Props) {
  const [scoring, setScoring] = useState<ScoringSettings>(normalizeScoring(league.scoring));
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [saveError, setSaveError] = useState('');
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleSaveScoring = () => {
    if (scoring.bench_enabled && scoring.starters_count + scoring.bench_count !== league.max_teams_per_user) {
      setSaveError(`Starters + Bench must total ${league.max_teams_per_user} (this league's teams per player)`);
      return;
    }
    setSaveError('');
    onUpdateScoring(scoring);
    setShowSavedToast(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setShowSavedToast(false), TOAST_DURATION_MS);
  };

  return (
    <div className="space-y-4">
      {/* Roster conference limits */}
      <div className="card p-5 space-y-4">
        <h3 className="font-medium text-white text-sm">Roster Conference Limits</h3>
        <p className="text-xs text-turf-400">Applies during the draft and to portal/waiver moves.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
          <ScoreField
            label="P4 Min (per conference)"
            min={0}
            value={scoring.p4_conf_min}
            onChange={v => setScoring(prev => ({ ...prev, p4_conf_min: v }))}
          />
          <ScoreField
            label="P4 Max (per conference)"
            min={1}
            value={scoring.p4_conf_max}
            onChange={v => setScoring(prev => ({ ...prev, p4_conf_max: v }))}
          />
          <ScoreField
            label="G5 Min (combined)"
            min={0}
            value={scoring.g5_conf_min}
            onChange={v => setScoring(prev => ({ ...prev, g5_conf_min: v }))}
          />
          <ScoreField
            label="G5 Max (combined)"
            min={1}
            value={scoring.g5_conf_max}
            onChange={v => setScoring(prev => ({ ...prev, g5_conf_max: v }))}
          />
        </div>
        <p className="text-xs text-turf-500">
          P4 = SEC, Big Ten, Big 12, ACC — each conference is capped separately. G5/non-P4 teams share one combined limit.
        </p>
      </div>

      {/* Excluded conferences */}
      <div className="card p-5 space-y-3">
        <h3 className="font-medium text-white text-sm">Excluded Conferences</h3>
        <p className="text-xs text-turf-400">
          Teams from checked conferences can't be drafted or picked up via the portal/waivers.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {allConferences.map(conference => {
            const excluded = scoring.excluded_conferences.includes(conference);
            return (
              <button
                key={conference}
                type="button"
                onClick={() => toggleExcludedConference(conference)}
                aria-pressed={excluded}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                  excluded
                    ? 'border-red-800 bg-red-950/30 text-red-300'
                    : 'border-turf-700 text-turf-300 hover:border-turf-600 hover:bg-turf-800/40'
                }`}
              >
                <span className="truncate">{conference}</span>
                {excluded && <span className="text-[10px] uppercase tracking-wide flex-shrink-0">Excluded</span>}
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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white text-sm">Statistical Ranking Bonuses</h3>
            <p className="text-xs text-turf-400 mt-0.5">
              Award points to whoever owns a top- or bottom-ranked team in each category
              (among all drafted teams). Shown as a live preview until conference championship
              week, then locks in.
            </p>
          </div>
          <Toggle
            checked={scoring.stat_bonus_enabled}
            onChange={() => setScoring(prev => ({ ...prev, stat_bonus_enabled: !prev.stat_bonus_enabled }))}
            label={`${scoring.stat_bonus_enabled ? 'Disable' : 'Enable'} statistical ranking bonuses`}
          />
        </div>

        {statBonusPanel.shown && (
          <div className={`space-y-3 pt-2 border-t border-turf-800 ${statBonusPanel.className}`}>
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
                          <TrendingUp className="w-3 h-3 text-field-400" /> Top Bonus
                        </span>
                        <Toggle
                          checked={c.top_enabled}
                          onChange={() => updateCat({ top_enabled: !c.top_enabled })}
                          label={`${c.top_enabled ? 'Disable' : 'Enable'} ${STAT_BONUS_LABELS[cat]} top bonus`}
                        />
                      </div>
                      {c.top_enabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-2">
                          <ScoreField
                            label="# of Teams"
                            variant="compact"
                            min={1}
                            value={c.top_count}
                            onChange={v => updateCat({ top_count: v })}
                          />
                          <ScoreField
                            label="Points Each"
                            variant="compact"
                            step={0.5}
                            value={c.top_points}
                            onChange={v => updateCat({ top_points: v })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Bottom */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-turf-400 flex items-center gap-1">
                          <TrendingDown className="w-3 h-3 text-red-300" /> Bottom Bonus
                        </span>
                        <Toggle
                          checked={c.bottom_enabled}
                          onChange={() => updateCat({ bottom_enabled: !c.bottom_enabled })}
                          label={`${c.bottom_enabled ? 'Disable' : 'Enable'} ${STAT_BONUS_LABELS[cat]} bottom bonus`}
                        />
                      </div>
                      {c.bottom_enabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-2">
                          <ScoreField
                            label="# of Teams"
                            variant="compact"
                            min={1}
                            value={c.bottom_count}
                            onChange={v => updateCat({ bottom_count: v })}
                          />
                          <ScoreField
                            label="Points Each"
                            variant="compact"
                            step={0.5}
                            description="Negative values subtract points"
                            value={c.bottom_points}
                            onChange={v => updateCat({ bottom_points: v })}
                          />
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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white text-sm">Spread Betting</h3>
            <p className="text-xs text-turf-400 mt-0.5">Users pick which teams will cover or beat the spread each week</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-turf-400">{scoring.spread_enabled ? 'Enabled' : 'Disabled'}</span>
            <button
              onClick={() => setScoring(prev => ({ ...prev, spread_enabled: !prev.spread_enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${scoring.spread_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        {spreadPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${spreadPanel.className}`}>
            {/* Points mode toggle */}
            <div>
              <label className="label">Point Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setScoring(prev => ({ ...prev, spread_is_multiplier: false }))}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-all ${!scoring.spread_is_multiplier ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                >
                  Flat Points
                </button>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, spread_is_multiplier: true }))}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-all ${scoring.spread_is_multiplier ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                >
                  Multiplier
                </button>
              </div>
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
                    ? `-${scoring.spread_miss_penalty_points} pts (custom)`
                    : scoring.spread_is_multiplier ? `×${scoring.spread_points}` : `-${scoring.spread_points} pts`}</>
                }
              />

              <ScoreField
                label="Max Picks / Week"
                min={1}
                max={10}
                value={scoring.spread_max_per_week}
                onChange={v => setScoring(prev => ({ ...prev, spread_max_per_week: v }))}
              />

              <ScoreField
                label="Max Picks / Team / Season"
                min={1}
                max={20}
                value={scoring.spread_max_per_team}
                onChange={v => setScoring(prev => ({ ...prev, spread_max_per_team: v }))}
              />

              <div className="flex flex-col justify-end">
                <label className="label">Captain Stacking</label>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <button
                    onClick={() => setScoring(prev => ({ ...prev, spread_allow_captain_stack: !prev.spread_allow_captain_stack }))}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.spread_allow_captain_stack ? 'bg-field-500' : 'bg-turf-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_allow_captain_stack ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <span className="text-xs text-turf-400">
                    {scoring.spread_allow_captain_stack ? 'Allowed' : 'Not allowed'}
                  </span>
                </label>
                <p className="text-xs text-turf-500 mt-0.5">Pick spread on captain's team</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Against-the-Spread Picks</p>
                <p className="text-xs text-turf-500 mt-0.5">Let users pick a team to NOT cover the spread, not just to cover it. A push (exact tie against the line) always awards zero points either way.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-turf-400">{scoring.spread_allow_against_pick ? 'Allowed' : 'Cover only'}</span>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, spread_allow_against_pick: !prev.spread_allow_against_pick }))}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.spread_allow_against_pick ? 'bg-field-500' : 'bg-turf-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_allow_against_pick ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Miss Penalty</p>
                <p className="text-xs text-turf-500 mt-0.5">Override the points lost when a spread pick misses (defaults to the same amount as covering)</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-turf-400">{scoring.spread_miss_penalty_enabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, spread_miss_penalty_enabled: !prev.spread_miss_penalty_enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.spread_miss_penalty_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_miss_penalty_enabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white text-sm">Portal</h3>
            <p className="text-xs text-turf-400 mt-0.5">Let managers drop a rostered team and add an available one</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-turf-400">{scoring.free_agency_enabled ? 'Enabled' : 'Disabled'}</span>
            <button
              onClick={() => setScoring(prev => ({ ...prev, free_agency_enabled: !prev.free_agency_enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${scoring.free_agency_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.free_agency_enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        {freeAgencyPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${freeAgencyPanel.className}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
              <ScoreField
                label="Max Adds/Drops / Season"
                min={0}
                value={scoring.fa_max_moves_per_season}
                onChange={v => setScoring(prev => ({ ...prev, fa_max_moves_per_season: v }))}
              />
              <ScoreField
                label="Max Adds/Drops / Week"
                min={0}
                value={scoring.fa_max_moves_per_week}
                onChange={v => setScoring(prev => ({ ...prev, fa_max_moves_per_week: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Point Penalty</p>
                <p className="text-xs text-turf-500 mt-0.5">Subtract points the week a swap is made</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-turf-400">{scoring.fa_penalty_enabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, fa_penalty_enabled: !prev.fa_penalty_enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.fa_penalty_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.fa_penalty_enabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white text-sm">Waiver Wire</h3>
              <p className="text-xs text-turf-400 mt-0.5">Queue adds/drops as claims resolved on a set day, with priority for contested teams</p>
            </div>
            <Toggle
              checked={scoring.waiver_enabled}
              onChange={() => setScoring(prev => ({ ...prev, waiver_enabled: !prev.waiver_enabled }))}
              label="Waiver Wire Enabled"
            />
          </div>

          {waiverPanel.shown && (
            <div className={`space-y-4 pt-2 border-t border-turf-800 ${waiverPanel.className}`}>
              <div>
                <label className="label">Priority Metric</label>
                <p className="text-xs text-turf-500 mb-2">Who wins when two managers claim the same team</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setScoring(prev => ({ ...prev, waiver_priority_metric: 'worst_record' }))}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-all ${scoring.waiver_priority_metric === 'worst_record' ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                  >
                    Worst Record
                  </button>
                  <button
                    onClick={() => setScoring(prev => ({ ...prev, waiver_priority_metric: 'fewest_points' }))}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-all ${scoring.waiver_priority_metric === 'fewest_points' ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                  >
                    Fewest Points
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Processing Day</label>
                  <select
                    className="input"
                    value={scoring.waiver_process_day}
                    onChange={e => setScoring(prev => ({ ...prev, waiver_process_day: parseInt(e.target.value) }))}
                  >
                    {WEEKDAY_NAMES.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">League Timezone</label>
                  <select
                    className="input"
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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white text-sm">Bench</h3>
            <p className="text-xs text-turf-400 mt-0.5">Split each roster into starters (score that week) and bench (don't). Locks per-team once its game kicks off.</p>
          </div>
          <Toggle
            checked={scoring.bench_enabled}
            onChange={() => setScoring(prev => ({ ...prev, bench_enabled: !prev.bench_enabled }))}
            label="Bench Enabled"
          />
        </div>

        {benchPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${benchPanel.className}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4">
              <ScoreField
                label="Starters"
                min={1}
                value={scoring.starters_count}
                onChange={v => setScoring(prev => ({ ...prev, starters_count: v }))}
              />
              <ScoreField
                label="Bench"
                min={0}
                value={scoring.bench_count}
                onChange={v => setScoring(prev => ({ ...prev, bench_count: v }))}
              />
            </div>
            <p className="text-xs text-turf-500">
              Must total {league.max_teams_per_user} — this league's teams per player. Currently {scoring.starters_count + scoring.bench_count}.
            </p>
          </div>
        )}
      </div>

      {saveError && (
        <div className="text-sm bg-red-900/40 text-red-300 border border-red-800 rounded-lg px-3 py-2">
          {saveError}
        </div>
      )}

      <button onClick={handleSaveScoring} className="btn-primary">
        Save Scoring Settings
      </button>

      <Toast message="Scoring settings saved" show={showSavedToast} />
    </div>
  );
}
