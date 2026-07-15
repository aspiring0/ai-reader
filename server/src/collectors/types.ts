import type { SourceType } from '@shared/types';

/** Raw item returned by a collector before scoring and DB insertion. */
export interface RawItem {
  source_type: SourceType;
  source_id: string;
  url: string;
  title: string;
  summary: string | null;
  lang: string;
  item_type: string;
  raw_data: string;
  stars: number;
  forks: number;
  author: string | null;
  pushed_at: string | null;
  open_issues?: number;
  closed_issues?: number;
}

/** A data source collector. */
export interface Collector {
  readonly name: string;
  fetch(): Promise<RawItem[]>;
}
