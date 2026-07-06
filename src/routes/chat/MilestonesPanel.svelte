<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { MilestoneDef } from '$lib/scenario/scenario';
  import type { MilestoneStatus } from '$lib/scenario/state';

  interface Props {
    milestones: MilestoneDef[];
    statuses: Record<string, MilestoneStatus> | undefined | null;
  }

  let { milestones = [], statuses = null }: Props = $props();

  let isExpanded = $state(true);

  // Helper to determine status safely
  function getStatus(id: string): MilestoneStatus {
    return statuses?.[id] ?? 'locked';
  }

  // Derived properties for stats & progress
  const completedCount = $derived(
    milestones.filter((m) => getStatus(m.id) === 'done').length
  );
  const totalCount = $derived(milestones.length);
  const progressPercent = $derived(
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  );
</script>

<div class="w-full bg-slate-50/90 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all duration-300">
  <!-- Header / Toggle Button -->
  <button
    type="button"
    onclick={() => (isExpanded = !isExpanded)}
    class="w-full flex items-center justify-between px-6 py-3.5 hover:bg-slate-100/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
    aria-expanded={isExpanded}
  >
    <div class="flex items-center gap-4 flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-indigo-600">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <span class="font-semibold text-slate-800 tracking-wide text-sm md:text-base">Meilensteine</span>
      </div>

      <!-- Compact Progress Stats & Bar -->
      <div class="hidden sm:flex items-center gap-3 flex-1 max-w-xs">
        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
          <div
            class="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
            style="width: {progressPercent}%"
          ></div>
        </div>
        <span class="text-xs font-bold text-slate-500 whitespace-nowrap">
          {completedCount} / {totalCount}
        </span>
      </div>

      <!-- Small Screens Simple Stats -->
      <span class="sm:hidden text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
        {completedCount}/{totalCount}
      </span>
    </div>

    <!-- Chevron Icon -->
    <div class="ml-4 text-slate-400 p-1 rounded-full hover:bg-slate-200/50 hover:text-slate-600 transition-all">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        stroke="currentColor"
        class="w-4 h-4 transform transition-transform duration-300 {isExpanded ? 'rotate-180' : ''}"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
    </div>
  </button>

  <!-- Collapsible List -->
  {#if isExpanded}
    <div transition:slide={{ duration: 300 }} class="overflow-hidden">
      <!-- Progress Bar for Mobile (Only shows when expanded) -->
      <div class="px-6 pb-2 sm:hidden">
        <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
          <div
            class="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
            style="width: {progressPercent}%"
          ></div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-6 border-t border-slate-200/60 bg-white/50">
        {#each milestones as milestone (milestone.id)}
          {@const status = getStatus(milestone.id)}
          <div
            class="flex items-start gap-3 p-3 rounded-xl border transition-all duration-300
              {status === 'done' ? 'bg-emerald-50/40 border-emerald-100 shadow-2xs' : ''}
              {status === 'active' || status === 'eligible' ? 'bg-indigo-50/30 border-indigo-100 ring-1 ring-indigo-500/10 shadow-2xs' : ''}
              {status === 'locked' ? 'bg-slate-50/20 border-slate-100 opacity-60' : ''}
              {status === 'skipped' ? 'bg-slate-50/30 border-slate-100 opacity-50 line-through' : ''}
            "
          >
            <!-- Status indicator icon -->
            <div class="shrink-0 mt-0.5">
              {#if status === 'done'}
                <div class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-2xs">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                    <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
                  </svg>
                </div>
              {:else if status === 'active' || status === 'eligible'}
                <div class="relative w-5 h-5 flex items-center justify-center">
                  <div class="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                </div>
              {:else if status === 'skipped'}
                <div class="w-5 h-5 rounded-full border-2 border-slate-300 bg-slate-100 flex items-center justify-center text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                    <path fill-rule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Z" clip-rule="evenodd" />
                  </svg>
                </div>
              {:else}
                <!-- Locked status -->
                <div class="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center text-slate-400 bg-slate-50">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                    <path fill-rule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clip-rule="evenodd" />
                  </svg>
                </div>
              {/if}
            </div>

            <!-- Milestone Objective -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-700 leading-snug break-words">
                {milestone.objective}
              </p>
              {#if milestone.optional}
                <span class="inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 uppercase tracking-wider">
                  Optional
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
