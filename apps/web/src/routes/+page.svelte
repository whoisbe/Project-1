<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import type { SearchResponse } from "../api/search/+server";
	import { normalizeDocUrl } from "$lib/url/normalizeDocUrl.js";

	// Initialize state from URL params
	function getInitialState() {
		const urlParams = $page.url.searchParams;
		return {
			q: urlParams.get("q") || "",
			mode:
				(urlParams.get("mode") as "keyword" | "semantic" | "hybrid") ||
				"hybrid",
			limit: parseInt(urlParams.get("limit") || "10", 10),
			rerank: urlParams.get("rerank") !== "false",
		};
	}

	let state = $state(getInitialState());
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchResponse = $state<SearchResponse | null>(null);

	// Update URL when state changes (but don't trigger search)
	function updateURL() {
		const params = new URLSearchParams();
		if (state.q) params.set("q", state.q);
		if (state.mode !== "hybrid") params.set("mode", state.mode);
		if (state.limit !== 10) params.set("limit", state.limit.toString());
		if (!state.rerank) params.set("rerank", "false");

		goto(`?${params.toString()}`, { replaceState: true, noScroll: true });
	}

	// Perform search
	async function performSearch() {
		if (!state.q.trim()) {
			error = "Please enter a search query";
			return;
		}

		loading = true;
		error = null;
		searchResponse = null;

		updateURL();

		// Create AbortController for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

		try {
			const params = new URLSearchParams({
				q: state.q,
				mode: state.mode,
				limit: state.limit.toString(),
				rerank: state.rerank.toString(),
			});

			const url = `/api/search?${params.toString()}`;
			console.log("Searching:", url);

			const response = await fetch(url, {
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				let errorMessage = `HTTP ${response.status}`;
				try {
					const errorData = await response.json();
					errorMessage = errorData.message || errorMessage;
				} catch {
					// If JSON parsing fails, use status text
					errorMessage = response.statusText || errorMessage;
				}
				throw new Error(errorMessage);
			}

			const data: SearchResponse = await response.json();
			searchResponse = data;
		} catch (err) {
			clearTimeout(timeoutId);

			if (err instanceof Error) {
				if (err.name === "AbortError") {
					error = "Request timed out. Please try again.";
				} else if (
					err.message.includes("Failed to fetch") ||
					err.message.includes("NetworkError")
				) {
					error =
						"Network error. Please check your connection and try again.";
				} else {
					error = err.message;
				}
			} else {
				error = "Failed to perform search. Please try again.";
			}

			console.error("Search error:", err);
		} finally {
			loading = false;
		}
	}

	// Handle form submit
	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		performSearch();
	}

	// Initialize search from URL on mount if query exists
	onMount(() => {
		const urlQuery = $page.url.searchParams.get("q");
		if (urlQuery && urlQuery.trim()) {
			// Only auto-search if there's a valid query in the URL
			performSearch();
		}
	});
</script>

<div class="search-page">
	<h2>Documentation Search</h2>

	<form onsubmit={handleSubmit} class="search-form">
		<div class="search-input-group">
			<input
				type="text"
				placeholder="Enter your search query..."
				bind:value={state.q}
				class="query-input"
				disabled={loading}
			/>
			<button
				type="submit"
				disabled={loading || !state.q.trim()}
				class="search-button"
			>
				{loading ? "Searching..." : "Search"}
			</button>
		</div>

		<div class="search-controls">
			<div class="control-group">
				<div class="label-with-tooltip">
					<label for="mode">Mode:</label>
					<div class="tooltip-container">
						<span class="help-icon">?</span>
						<div class="tooltip">
							<strong>Search Modes:</strong>
							<ul>
								<li>
									<strong>Keyword:</strong> Matches exact words
									in the document.
								</li>
								<li>
									<strong>Semantic:</strong> Matches the meaning
									and intent of your query.
								</li>
								<li>
									<strong>Hybrid:</strong> Combines keyword and
									vector search using Reciprocal Rank Fusion (RRF)
									and Reranking.
								</li>
							</ul>
						</div>
					</div>
				</div>
				<select id="mode" bind:value={state.mode} disabled={loading}>
					<option value="keyword">Keyword</option>
					<option value="semantic">Semantic</option>
					<option value="hybrid">Hybrid</option>
				</select>
			</div>

			<div class="control-group">
				<label for="limit">Limit:</label>
				<select id="limit" bind:value={state.limit} disabled={loading}>
					<option value={5}>5</option>
					<option value={10}>10</option>
					<option value={25}>25</option>
					<option value={50}>50</option>
				</select>
			</div>

			<div class="control-group">
				<label>
					<input
						type="checkbox"
						bind:checked={state.rerank}
						disabled={loading}
					/>
					Rerank
				</label>
			</div>
		</div>
	</form>

	{#if error}
		<div class="error-message">
			<strong>Error:</strong>
			{error}
		</div>
	{/if}

	{#if searchResponse}
		<div class="results-section">
			<div class="results-header">
				<h3>
					Found {searchResponse.results.length} result{searchResponse
						.results.length !== 1
						? "s"
						: ""}
					{searchResponse.timings_ms.total
						? ` (${searchResponse.timings_ms.total}ms)`
						: ""}
				</h3>
			</div>

			<div class="results-list">
				{#each searchResponse.results as result (result.id)}
					<div class="result-item">
						<div class="result-header">
							<h4>
								<a
									href={normalizeDocUrl(result.url)}
									target="_blank"
									rel="noopener noreferrer"
									class="result-title"
								>
									{result.title}
								</a>
							</h4>
							<div class="result-meta-line">
								<span class="section-path"
									>{result.section_path}</span
								>
								{#if result.keyword_rank !== undefined}
									<span class="meta-badge"
										>Keyword: {result.keyword_rank}</span
									>
								{/if}
								{#if result.vector_rank !== undefined}
									<span class="meta-badge"
										>Vector: {result.vector_rank}</span
									>
								{/if}
								{#if result.rrf_score !== undefined}
									<span class="meta-badge"
										>RRF: {result.rrf_score.toFixed(
											4,
										)}</span
									>
								{/if}
								{#if result.rerank_score !== undefined}
									<span class="meta-badge"
										>Rerank: {result.rerank_score.toFixed(
											4,
										)}</span
									>
								{/if}
							</div>
						</div>

						<div class="result-snippet">
							{@html result.snippet}
						</div>

						<details class="why-panel">
							<summary>Why this result?</summary>
							<div class="why-content">
								{#if result.keyword_rank !== undefined}
									<div class="why-item">
										<strong>Keyword Rank:</strong>
										{result.keyword_rank}
									</div>
								{/if}
								{#if result.vector_rank !== undefined}
									<div class="why-item">
										<strong>Vector Rank:</strong>
										{result.vector_rank}
										{#if result.vector_score !== undefined}
											<span class="score"
												>(score: {result.vector_score.toFixed(
													4,
												)})</span
											>
										{/if}
									</div>
								{/if}
								{#if result.rrf_score !== undefined}
									<div class="why-item">
										<strong>RRF Score:</strong>
										{result.rrf_score.toFixed(4)}
									</div>
								{/if}
								{#if result.rerank_score !== undefined}
									<div class="why-item">
										<strong>Rerank Score:</strong>
										{result.rerank_score.toFixed(4)}
									</div>
								{/if}
							</div>
						</details>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.search-page {
		padding: 2rem 0;
	}

	h2 {
		font-size: 2rem;
		margin-bottom: 2rem;
		color: #333;
		text-align: center;
	}

	.search-form {
		margin-bottom: 2rem;
	}

	.search-input-group {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.query-input {
		flex: 1;
		padding: 0.75rem 1rem;
		font-size: 1rem;
		border: 2px solid #ddd;
		border-radius: 4px;
	}

	.query-input:focus {
		outline: none;
		border-color: #4a90e2;
	}

	.query-input:disabled {
		background-color: #f5f5f5;
		cursor: not-allowed;
	}

	.search-button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		background-color: #4a90e2;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
	}

	.search-button:hover:not(:disabled) {
		background-color: #357abd;
	}

	.search-button:disabled {
		background-color: #ccc;
		cursor: not-allowed;
	}

	.search-controls {
		display: flex;
		gap: 1.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control-group label {
		font-weight: 500;
		color: #555;
	}

	.control-group select {
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.control-group select:disabled {
		background-color: #f5f5f5;
		cursor: not-allowed;
	}

	.control-group input[type="checkbox"] {
		margin-right: 0.25rem;
	}

	.error-message {
		padding: 1rem;
		background-color: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;
		color: #c33;
		margin-bottom: 1rem;
	}

	.results-section {
		margin-top: 2rem;
	}

	.results-header {
		margin-bottom: 1.5rem;
	}

	.results-header h3 {
		font-size: 1.25rem;
		color: #555;
		margin: 0;
	}

	.results-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.result-item {
		padding: 1.5rem;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		background-color: #fff;
	}

	.result-header {
		margin-bottom: 0.75rem;
	}

	.result-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: #4a90e2;
		text-decoration: none;
	}

	.result-title:hover {
		text-decoration: underline;
	}

	.result-meta-line {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-top: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.875rem;
		color: #666;
	}

	.section-path {
		font-weight: 500;
		color: #888;
	}

	.meta-badge {
		padding: 0.25rem 0.5rem;
		background-color: #f0f0f0;
		border-radius: 3px;
		font-size: 0.8rem;
	}

	.result-snippet {
		margin: 1rem 0;
		line-height: 1.6;
		color: #444;
	}

	.result-snippet :global(mark) {
		background-color: #ffeb3b;
		padding: 0.1em 0.2em;
		border-radius: 2px;
	}

	.why-panel {
		margin-top: 1rem;
		padding: 0.75rem;
		background-color: #f9f9f9;
		border-radius: 4px;
		border: 1px solid #e0e0e0;
	}

	.why-panel summary {
		cursor: pointer;
		font-weight: 500;
		color: #555;
		user-select: none;
	}

	.why-panel summary:hover {
		color: #333;
	}

	.why-content {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e0e0e0;
	}

	.why-item {
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}

	.why-item strong {
		color: #333;
		margin-right: 0.5rem;
	}

	.why-item .score {
		color: #666;
		margin-left: 0.5rem;
	}

	.label-with-tooltip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.tooltip-container {
		position: relative;
		display: inline-flex;
		align-items: center;
		cursor: help;
	}

	.help-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background-color: #ddd;
		color: #555;
		font-size: 10px;
		font-weight: bold;
	}

	.tooltip {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		background-color: #333;
		color: #fff;
		padding: 0.75rem;
		border-radius: 4px;
		font-size: 0.85rem;
		width: 250px;
		visibility: hidden;
		opacity: 0;
		transition:
			opacity 0.2s,
			visibility 0.2s;
		z-index: 1000;
		pointer-events: none;
		margin-bottom: 0.5rem;
		text-align: left;
		line-height: 1.4;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.tooltip::after {
		content: "";
		position: absolute;
		top: 100%;
		left: 50%;
		margin-left: -6px;
		border-width: 6px;
		border-style: solid;
		border-color: #333 transparent transparent transparent;
	}

	.tooltip strong {
		color: #fff;
		display: block;
		margin-bottom: 0.25rem;
	}

	.tooltip ul {
		margin: 0;
		padding-left: 1rem;
	}

	.tooltip li {
		margin-bottom: 0.25rem;
	}

	.tooltip-container:hover .tooltip {
		visibility: visible;
		opacity: 1;
	}
</style>
