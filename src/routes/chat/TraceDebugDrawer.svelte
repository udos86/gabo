<script lang="ts">
  import type { LessonState } from '$lib/scenario/state';
  import type { JudgeReport, SessionTrace } from '$lib/trace/types';

  interface Props {
    sessionId: string;
    lessonState: LessonState | null;
  }

  let { sessionId, lessonState }: Props = $props();

  let isOpen = $state(false);
  let liveTrace = $state<SessionTrace | null>(null);
  let copied = $state(false);
  let expandedPrompts = $state<Record<string, boolean>>({});

  let judgeReport = $state<JudgeReport | null>(null);
  let isEvaluating = $state(false);
  let judgeError = $state<string | null>(null);

  async function fetchTrace() {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/trace?sessionId=${sessionId}`);
      if (res.ok) {
        liveTrace = (await res.json()) as SessionTrace;
      }
    } catch (e) {
      console.error('Failed to fetch live trace:', e);
    }
  }

  async function triggerJudge() {
    if (!sessionId) return;
    isEvaluating = true;
    judgeError = null;
    try {
      const res = await fetch('/api/trace/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Evaluation request failed');
      }
      judgeReport = data.report as JudgeReport;
    } catch (err: unknown) {
      console.error('Judge evaluation failed:', err);
      judgeError = err instanceof Error ? err.message : String(err);
    } finally {
      isEvaluating = false;
    }
  }

  function downloadTraceJson() {
    if (!liveTrace) return;
    const blob = new Blob([JSON.stringify(liveTrace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copySessionId() {
    navigator.clipboard.writeText(sessionId);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function togglePrompt(key: string) {
    expandedPrompts[key] = !expandedPrompts[key];
  }

  $effect(() => {
    if (isOpen) {
      void fetchTrace();
    }
  });
</script>

{#snippet messageViewer(key: string, messages?: Array<{ role: string; content: string }>, colorClass = 'text-emerald-400', borderClass = 'border-emerald-900/40')}
  {#if messages && messages.length > 0}
    <div>
      <button
        type="button"
        onclick={() => togglePrompt(key)}
        class="text-[10px] {colorClass} hover:opacity-80 underline cursor-pointer"
      >
        {expandedPrompts[key] ? 'Hide input messages' : `Show input messages (${messages.length})`}
      </button>
      {#if expandedPrompts[key]}
        <div class="mt-1.5 p-2 rounded bg-black/60 text-[10px] text-slate-300 overflow-x-auto max-h-56 font-mono border {borderClass} space-y-2">
          {#each messages as msg, i (i)}
            <div class="border-b border-slate-800/80 pb-1.5 last:border-b-0 last:pb-0">
              <span class="font-bold text-[9px] uppercase px-1.5 py-0.5 rounded {msg.role === 'system' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : msg.role === 'user' ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}">
                {msg.role}
              </span>
              <pre class="mt-1 whitespace-pre-wrap text-slate-300 font-mono text-[10px]">{msg.content}</pre>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<!-- Floating Toggle Badge -->
<div class="fixed top-3 right-4 z-50">
  <button
    type="button"
    onclick={() => {
      isOpen = !isOpen;
      if (isOpen) void fetchTrace();
    }}
    data-testid="debug-drawer-toggle"
    class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900/80 hover:bg-slate-900 text-white shadow-md backdrop-blur-md transition-all border border-slate-700/50 cursor-pointer"
  >
    <span class="w-2 h-2 rounded-full {lessonState?.status === 'won' ? 'bg-emerald-400' : 'bg-indigo-400 animate-pulse'}"></span>
    <span>Trace & Telemetry</span>
    {#if lessonState}
      <span class="text-slate-400">T{lessonState.turn}/{lessonState.maxTurns}</span>
    {/if}
  </button>
</div>

<!-- Drawer Modal / Slide-out -->
{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
    onclick={() => (isOpen = false)}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-full max-w-2xl bg-slate-900 text-slate-100 h-full shadow-2xl flex flex-col border-l border-slate-800"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Drawer Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
          <div>
            <h2 class="text-base font-bold text-white">Session Telemetry & Trace</h2>
            <p class="text-xs text-slate-400 font-mono truncate max-w-xs">{sessionId}</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={triggerJudge}
            disabled={isEvaluating || !liveTrace || liveTrace.turns.length === 0}
            data-testid="trigger-judge-btn"
            class="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {#if isEvaluating}
              <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span>Evaluating...</span>
            {:else}
              <span>⚖️ Run Judge Audit</span>
            {/if}
          </button>
          <button
            type="button"
            onclick={copySessionId}
            class="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy ID'}
          </button>
          <button
            type="button"
            onclick={downloadTraceJson}
            disabled={!liveTrace}
            class="px-2.5 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Export JSON
          </button>
          <button
            type="button"
            onclick={() => (isOpen = false)}
            class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Drawer Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- Live State & Telemetry Metrics Badges -->
        <div class="grid grid-cols-4 gap-2 text-center">
          <div class="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
            <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Mode</span>
            <p class="text-sm font-bold text-indigo-300 capitalize">{lessonState?.mode ?? 'init'}</p>
          </div>
          <div class="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
            <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Focus</span>
            <p class="text-sm font-bold text-amber-300 truncate">{lessonState?.focusMilestoneId ?? 'none'}</p>
          </div>
          <div class="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
            <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Status</span>
            <p class="text-sm font-bold {lessonState?.status === 'won' ? 'text-emerald-400' : 'text-slate-300'} capitalize">
              {lessonState?.status ?? 'in_progress'}
            </p>
          </div>
          <div class="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
            <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Tokens</span>
            <p class="text-sm font-bold text-sky-400 font-mono">
              {liveTrace?.summary?.totalTokens.totalTokens ?? 0}
            </p>
          </div>
        </div>

        {#if judgeError}
          <div class="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 space-y-1">
            <p class="font-bold">❌ Evaluation Error:</p>
            <p>{judgeError}</p>
          </div>
        {/if}

        <!-- Judge Evaluation Report Preview -->
        {#if judgeReport}
          <div class="bg-slate-950/80 p-5 rounded-2xl border border-purple-500/40 shadow-xl space-y-4" data-testid="judge-report-view">
            <div class="flex items-center justify-between pb-3 border-b border-slate-800">
              <div class="flex items-center gap-2">
                <span class="text-lg">⚖️</span>
                <div>
                  <h4 class="text-xs font-bold uppercase tracking-wider text-purple-400">Judge LLM Audit Result</h4>
                  <span class="text-[10px] text-slate-500">{new Date(judgeReport.evaluatedAt).toLocaleTimeString()}</span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-2xl font-black text-emerald-400">{judgeReport.overallScore}</span>
                <span class="text-xs text-slate-400"> / 10</span>
              </div>
            </div>

            <!-- Category Scores -->
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center">
                <span class="text-slate-400">Naturalness:</span>
                <span class="font-bold font-mono text-emerald-400">{judgeReport.categoryScores.naturalness}/10</span>
              </div>
              <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center">
                <span class="text-slate-400">Continuity:</span>
                <span class="font-bold font-mono text-emerald-400">{judgeReport.categoryScores.continuity}/10</span>
              </div>
              <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center">
                <span class="text-slate-400">Sensing Accuracy:</span>
                <span class="font-bold font-mono text-emerald-400">{judgeReport.categoryScores.sensingAccuracy}/10</span>
              </div>
              <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center">
                <span class="text-slate-400">Pedagogy / Guidance:</span>
                <span class="font-bold font-mono text-emerald-400">{judgeReport.categoryScores.pedagogicalGuidance}/10</span>
              </div>
            </div>

            <!-- Summary -->
            <div class="space-y-1">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Executive Summary</span>
              <p class="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                {judgeReport.summary}
              </p>
            </div>

            <!-- Milestone Analysis -->
            {#if judgeReport.milestoneAnalysis}
              <div class="space-y-1">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Milestone Progression Analysis</span>
                <p class="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                  {judgeReport.milestoneAnalysis}
                </p>
              </div>
            {/if}

            <!-- Findings -->
            {#if judgeReport.findings.length > 0}
              <div class="space-y-2 pt-2 border-t border-slate-800">
                <span class="text-xs font-semibold text-slate-400">Key Findings ({judgeReport.findings.length}):</span>
                {#each judgeReport.findings as finding, idx (idx)}
                  <div class="p-3 rounded-xl bg-slate-900/90 text-xs space-y-1.5 border border-slate-800">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase {finding.severity === 'critical' ? 'bg-rose-900/60 text-rose-300 border border-rose-800' : finding.severity === 'warning' ? 'bg-amber-900/60 text-amber-300 border border-amber-800' : 'bg-sky-900/60 text-sky-300 border border-sky-800'}">
                          {finding.severity}
                        </span>
                        <span class="text-[10px] text-purple-400 uppercase font-mono">[{finding.category}]</span>
                        {#if finding.turnIndex !== null && finding.turnIndex !== undefined}
                          <span class="text-[10px] text-slate-500 font-mono">Turn {finding.turnIndex}</span>
                        {/if}
                      </div>
                    </div>
                    <p class="font-medium text-slate-200">{finding.description}</p>
                    {#if finding.evidence}
                      <p class="text-[11px] font-mono text-slate-400 bg-slate-950/60 p-1.5 rounded border border-slate-800/50 italic">
                        "{finding.evidence}"
                      </p>
                    {/if}
                    <p class="text-slate-300 text-[11px]"><span class="text-amber-400 font-semibold">💡 Recommendation:</span> {finding.recommendation}</p>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Prompt Recommendations -->
            {#if judgeReport.promptRecommendations && judgeReport.promptRecommendations.length > 0}
              <div class="space-y-2 pt-2 border-t border-slate-800">
                <span class="text-xs font-semibold text-slate-400">Prompt & Scenario Improvements:</span>
                {#each judgeReport.promptRecommendations as rec, idx (idx)}
                  <div class="p-3 rounded-xl bg-slate-900/80 text-xs space-y-1 border border-slate-800">
                    <div class="font-bold text-indigo-400 uppercase font-mono text-[10px]">Target: {rec.target}</div>
                    <div class="text-slate-400 text-[11px]"><span class="text-slate-500">Observed:</span> {rec.currentBehavior}</div>
                    <div class="text-emerald-300 text-[11px]"><span class="text-emerald-400 font-semibold">Change:</span> {rec.recommendedChange}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Turns Stream / History Snapshot -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">
              Recorded Turns ({liveTrace?.turns.length ?? 0})
            </h3>
            <button
              type="button"
              onclick={fetchTrace}
              class="px-2 py-0.5 text-xs text-indigo-400 hover:text-indigo-300 rounded bg-indigo-950/40 border border-indigo-800/50 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

          {#if !liveTrace || liveTrace.turns.length === 0}
            <div class="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
              No turn data recorded yet. Turns appear as the lesson plays.
            </div>
          {:else}
            <div class="space-y-4">
              {#each liveTrace.turns as turn (turn.turnIndex)}
                <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs space-y-3">
                  <!-- Turn Header -->
                  <div class="flex items-center justify-between pb-2 border-b border-slate-700/40">
                    <span class="font-bold text-sm text-slate-100">Turn {turn.turnIndex}</span>
                    <span class="text-slate-400 font-mono text-[11px]">{new Date(turn.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <!-- Student Input -->
                  {#if turn.studentInput}
                    <div class="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                      <span class="text-indigo-400 font-semibold">Student Input:</span>
                      <span class="text-slate-200 ml-1 italic">"{turn.studentInput}"</span>
                    </div>
                  {/if}

                  <!-- Director Card -->
                  {#if turn.director}
                    <div class="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 font-semibold text-emerald-400">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>Director Agent ({turn.director.model})</span>
                        </div>
                        <div class="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
                          <span>{turn.director.durationMs}ms</span>
                          {#if turn.director.tokens}
                            <span class="text-emerald-300">
                              {turn.director.tokens.totalTokens} tokens ({turn.director.tokens.promptTokens} in / {turn.director.tokens.completionTokens} out)
                            </span>
                          {/if}
                        </div>
                      </div>

                      <div class="space-y-1 text-slate-300">
                        <div>
                          <span class="text-slate-400 font-medium">Sensed Completions:</span>
                          <span class="font-mono text-emerald-300 ml-1">
                            [{turn.director.output.observedDeltas.completedMilestones.join(', ') || 'none'}]
                          </span>
                        </div>
                        {#if turn.director.output.observedDeltas.filledSlots.length > 0}
                          <div>
                            <span class="text-slate-400 font-medium">Filled Slots:</span>
                            <span class="font-mono text-emerald-300 ml-1">
                              {JSON.stringify(turn.director.output.observedDeltas.filledSlots)}
                            </span>
                          </div>
                        {/if}
                        <div>
                          <span class="text-slate-400 font-medium">Stage Directions:</span>
                          <span class="italic text-slate-200 ml-1">
                            {turn.director.output.stageDirections.join(' | ')}
                          </span>
                        </div>
                      </div>

                      {@render messageViewer(`director-${turn.turnIndex}`, turn.director.messages, 'text-emerald-400', 'border-emerald-900/40')}
                    </div>
                  {/if}

                  <!-- Reducer State Snapshot -->
                  {#if turn.reducedState}
                    <div class="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] space-y-1">
                      <div class="flex items-center justify-between text-slate-400">
                        <span class="font-semibold text-slate-300">State Transition</span>
                        <span>Turn {turn.reducedState.turn} · Mode: {turn.reducedState.mode}</span>
                      </div>
                      <div class="flex flex-wrap gap-1 pt-1">
                        {#each Object.entries(turn.reducedState.milestones) as [id, status] (id)}
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono {status === 'done' ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50' : status === 'active' ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/50' : 'bg-slate-900 text-slate-500 border border-slate-800'}">
                            {id}: {status}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <!-- Actor Card -->
                  {#if turn.actor}
                    <div class="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 font-semibold text-amber-400">
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          <span>Actor Agent ({turn.actor.model})</span>
                        </div>
                        <div class="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
                          <span>{turn.actor.durationMs}ms</span>
                          {#if turn.actor.tokens}
                            <span class="text-amber-300">
                              {turn.actor.tokens.totalTokens} tokens ({turn.actor.tokens.promptTokens} in / {turn.actor.tokens.completionTokens} out)
                            </span>
                          {/if}
                        </div>
                      </div>

                      <div class="text-slate-200">
                        <span class="text-slate-400 font-medium">Dialogue Spoken:</span>
                        <span class="font-serif text-amber-200 ml-1">"{turn.actor.output.text}"</span>
                      </div>
                      {#if turn.actor.output.action}
                        <div class="text-slate-300 text-[11px]">
                          <span class="text-slate-400 font-medium">Action:</span>
                          <span class="italic text-slate-300 ml-1">[{turn.actor.output.action}]</span>
                        </div>
                      {/if}

                      {@render messageViewer(`actor-${turn.turnIndex}`, turn.actor.messages, 'text-amber-400', 'border-amber-900/40')}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
