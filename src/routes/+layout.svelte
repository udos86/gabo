<script lang="ts">
	import "./layout.css";
	import favicon from "$lib/assets/favicon.svg";

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<header>
	<h1>Gabo AI</h1>
</header>

<main class="flex flex-col min-h-0 h-full">
		{@render children()}
</main>
