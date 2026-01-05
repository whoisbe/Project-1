<header>
	<h1>AI Search MVP</h1>
</header>

<main>
	<slot />
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, -apple-system, sans-serif;
	}

	header {
		padding: 1rem 2rem;
		border-bottom: 1px solid #e0e0e0;
		background-color: #f9f9f9;
	}

	header h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
	}

	main {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}
</style>

