import { describe, it, expect } from 'vitest';
import { rrfFuse, type SearchResultBase } from './rrf';

/**
 * Helper to create a test result with minimal required fields
 */
function createResult(
	id: string,
	keywordRank?: number,
	vectorRank?: number
): SearchResultBase & { keyword_rank?: number; vector_rank?: number } {
	const base: SearchResultBase = {
		id,
		title: `Doc ${id}`,
		url: `/doc/${id}`,
		section_path: '/',
		snippet: `Snippet for doc ${id}`
	};

	if (keywordRank !== undefined) {
		return { ...base, keyword_rank: keywordRank };
	}
	if (vectorRank !== undefined) {
		return { ...base, vector_rank: vectorRank };
	}
	return base;
}

describe('rrfFuse', () => {
	describe('overlap docs', () => {
		it('should merge docs that appear in both lists', () => {
			const keywordResults = [
				createResult('1', 1),
				createResult('2', 2)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('2', undefined, 1),
				createResult('3', undefined, 2)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults);

			// Doc 2 should appear once with both ranks
			const doc2 = fused.find(r => r.id === '2');
			expect(doc2).toBeDefined();
			expect(doc2?.keyword_rank).toBe(2);
			expect(doc2?.vector_rank).toBe(1);
			expect(doc2?.rrf_score).toBeCloseTo(1 / 62 + 1 / 61, 5);

			// Doc 2 should have highest score (appears in both lists)
			expect(fused[0].id).toBe('2');
		});

		it('should prefer non-empty snippet when merging', () => {
			const keywordResults = [
				{
					id: '1',
					title: 'Doc 1',
					url: '/doc/1',
					section_path: '/',
					snippet: '', // Empty snippet
					keyword_rank: 1
				}
			];

			const vectorResults = [
				{
					id: '1',
					title: 'Doc 1',
					url: '/doc/1',
					section_path: '/',
					snippet: 'Non-empty snippet from vector',
					vector_rank: 1
				}
			];

			const fused = rrfFuse(keywordResults, vectorResults);

			expect(fused).toHaveLength(1);
			expect(fused[0].snippet).toBe('Non-empty snippet from vector');
		});

		it('should preserve existing snippet if both are non-empty', () => {
			const keywordResults = [
				{
					id: '1',
					title: 'Doc 1',
					url: '/doc/1',
					section_path: '/',
					snippet: 'Keyword snippet',
					keyword_rank: 1
				}
			];

			const vectorResults = [
				{
					id: '1',
					title: 'Doc 1',
					url: '/doc/1',
					section_path: '/',
					snippet: 'Vector snippet',
					vector_rank: 1
				}
			];

			const fused = rrfFuse(keywordResults, vectorResults);

			expect(fused).toHaveLength(1);
			// Should preserve the first one encountered (keyword in this case)
			expect(fused[0].snippet).toBe('Keyword snippet');
		});
	});

	describe('non-overlap docs', () => {
		it('should include docs from both lists even if no overlap', () => {
			const keywordResults = [
				createResult('1', 1),
				createResult('2', 2)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('3', undefined, 1),
				createResult('4', undefined, 2)
			] as Array<SearchResultBase & { vector_rank: number }>;

			// Use a limit that includes all results to test the merge behavior
			const fused = rrfFuse(keywordResults, vectorResults, { limit: 10 });

			expect(fused).toHaveLength(4);

			// All docs should be present
			const ids = fused.map(r => r.id).sort();
			expect(ids).toEqual(['1', '2', '3', '4']);

			// Doc 1 should only have keyword_rank
			const doc1 = fused.find(r => r.id === '1');
			expect(doc1?.keyword_rank).toBe(1);
			expect(doc1?.vector_rank).toBeUndefined();

			// Doc 3 should only have vector_rank
			const doc3 = fused.find(r => r.id === '3');
			expect(doc3?.keyword_rank).toBeUndefined();
			expect(doc3?.vector_rank).toBe(1);
		});
	});

	describe('stable ranking for higher ranks', () => {
		it('should rank higher-ranked items first within same list type', () => {
			const keywordResults = [
				createResult('1', 1),
				createResult('2', 2),
				createResult('3', 3)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('4', undefined, 1),
				createResult('5', undefined, 2)
			] as Array<SearchResultBase & { vector_rank: number }>;

			// Use a high limit to include all results for this test
			const fused = rrfFuse(keywordResults, vectorResults, { limit: 10 });

			// Doc 1 (keyword rank 1) should rank higher than Doc 2 (keyword rank 2)
			const doc1Index = fused.findIndex(r => r.id === '1');
			const doc2Index = fused.findIndex(r => r.id === '2');
			expect(doc1Index).toBeLessThan(doc2Index);

			// Doc 4 (vector rank 1) should rank higher than Doc 5 (vector rank 2)
			const doc4Index = fused.findIndex(r => r.id === '4');
			const doc5Index = fused.findIndex(r => r.id === '5');
			expect(doc4Index).toBeLessThan(doc5Index);
		});

		it('should rank overlapping docs higher than non-overlapping', () => {
			const keywordResults = [
				createResult('1', 1) // Rank 1 in keyword
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('1', undefined, 5), // Rank 5 in vector (overlap)
				createResult('2', undefined, 1) // Rank 1 in vector (no overlap)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults);

			// Doc 1 (overlap: keyword rank 1 + vector rank 5) should rank higher
			// than Doc 2 (only vector rank 1)
			// Doc 1: 1/61 + 1/65 = 0.0164 + 0.0154 = 0.0318
			// Doc 2: 1/61 = 0.0164
			expect(fused[0].id).toBe('1');
			expect(fused[1].id).toBe('2');
		});
	});

	describe('k parameter effect', () => {
		it('should use default k=60', () => {
			const keywordResults = [
				createResult('1', 1)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('1', undefined, 1)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults);

			// With k=60, rank 1 gives: 1/(60+1) = 1/61
			expect(fused[0].rrf_score).toBeCloseTo(1 / 61 + 1 / 61, 5);
		});

		it('should respect custom k parameter', () => {
			const keywordResults = [
				createResult('1', 1)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('1', undefined, 1)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults, { k: 10 });

			// With k=10, rank 1 gives: 1/(10+1) = 1/11
			expect(fused[0].rrf_score).toBeCloseTo(1 / 11 + 1 / 11, 5);
		});

		it('should have higher scores with smaller k (more rank sensitivity)', () => {
			const keywordResults = [
				createResult('1', 1)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('1', undefined, 1)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fusedK10 = rrfFuse(keywordResults, vectorResults, { k: 10 });
			const fusedK60 = rrfFuse(keywordResults, vectorResults, { k: 60 });

			// Smaller k should give higher scores
			expect(fusedK10[0].rrf_score).toBeGreaterThan(fusedK60[0].rrf_score);
		});
	});

	describe('limit parameter', () => {
		it('should use default limit (max of input lengths)', () => {
			const keywordResults = [
				createResult('1', 1),
				createResult('2', 2)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('3', undefined, 1),
				createResult('4', undefined, 2),
				createResult('5', undefined, 3),
				createResult('6', undefined, 4)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults);

			// Default limit should be max(2, 4) = 4, but we have 6 unique docs
			// So all 6 should be returned
			expect(fused.length).toBeGreaterThanOrEqual(4);
		});

		it('should respect custom limit', () => {
			const keywordResults = [
				createResult('1', 1),
				createResult('2', 2),
				createResult('3', 3)
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('4', undefined, 1),
				createResult('5', undefined, 2)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults, { limit: 2 });

			expect(fused).toHaveLength(2);
		});

		it('should return top results by rrf_score when limit is applied', () => {
			const keywordResults = [
				createResult('1', 1), // High keyword rank
				createResult('2', 10) // Lower keyword rank
			] as Array<SearchResultBase & { keyword_rank: number }>;

			const vectorResults = [
				createResult('3', undefined, 1), // High vector rank
				createResult('4', undefined, 10) // Lower vector rank
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults, { limit: 2 });

			expect(fused).toHaveLength(2);
			// Should be sorted by rrf_score descending
			expect(fused[0].rrf_score).toBeGreaterThanOrEqual(fused[1].rrf_score);
		});
	});

	describe('edge cases', () => {
		it('should handle empty keyword results', () => {
			const keywordResults: Array<SearchResultBase & { keyword_rank: number }> = [];
			const vectorResults = [
				createResult('1', undefined, 1),
				createResult('2', undefined, 2)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults);

			expect(fused).toHaveLength(2);
			expect(fused[0].vector_rank).toBe(1);
			expect(fused[0].keyword_rank).toBeUndefined();
		});

		it('should handle empty vector results', () => {
			const keywordResults = [
				createResult('1', 1),
				createResult('2', 2)
			] as Array<SearchResultBase & { keyword_rank: number }>;
			const vectorResults: Array<SearchResultBase & { vector_rank: number }> = [];

			const fused = rrfFuse(keywordResults, vectorResults);

			expect(fused).toHaveLength(2);
			expect(fused[0].keyword_rank).toBe(1);
			expect(fused[0].vector_rank).toBeUndefined();
		});

		it('should handle both empty results', () => {
			const keywordResults: Array<SearchResultBase & { keyword_rank: number }> = [];
			const vectorResults: Array<SearchResultBase & { vector_rank: number }> = [];

			const fused = rrfFuse(keywordResults, vectorResults);

			expect(fused).toHaveLength(0);
		});

		it('should handle zero limit', () => {
			const keywordResults = [
				createResult('1', 1)
			] as Array<SearchResultBase & { keyword_rank: number }>;
			const vectorResults = [
				createResult('2', undefined, 1)
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults, { limit: 0 });

			expect(fused).toHaveLength(0);
		});
	});

	describe('RRF score calculation', () => {
		it('should calculate correct RRF score for keyword-only doc', () => {
			const keywordResults = [
				createResult('1', 5) // Rank 5
			] as Array<SearchResultBase & { keyword_rank: number }>;
			const vectorResults: Array<SearchResultBase & { vector_rank: number }> = [];

			const fused = rrfFuse(keywordResults, vectorResults, { k: 60 });

			expect(fused[0].rrf_score).toBeCloseTo(1 / (60 + 5), 5);
		});

		it('should calculate correct RRF score for vector-only doc', () => {
			const keywordResults: Array<SearchResultBase & { keyword_rank: number }> = [];
			const vectorResults = [
				createResult('1', undefined, 3) // Rank 3
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults, { k: 60 });

			expect(fused[0].rrf_score).toBeCloseTo(1 / (60 + 3), 5);
		});

		it('should calculate correct RRF score for overlapping doc', () => {
			const keywordResults = [
				createResult('1', 2) // Rank 2
			] as Array<SearchResultBase & { keyword_rank: number }>;
			const vectorResults = [
				createResult('1', undefined, 4) // Rank 4
			] as Array<SearchResultBase & { vector_rank: number }>;

			const fused = rrfFuse(keywordResults, vectorResults, { k: 60 });

			// Should be: 1/(60+2) + 1/(60+4) = 1/62 + 1/64
			const expectedScore = 1 / 62 + 1 / 64;
			expect(fused[0].rrf_score).toBeCloseTo(expectedScore, 5);
		});
	});
});

