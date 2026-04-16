<script lang="ts">
	import "./layout.css";
	import favicon from "$lib/assets/favicon.svg";

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<header class="shadow-[1px_1px_4px_rgba(0,0,0,0.5)]">
	<h1 class="p-4">Gabo AI</h1>
</header>

<main class="flex flex-col min-h-0 h-full">
	{@render children()}
</main>
