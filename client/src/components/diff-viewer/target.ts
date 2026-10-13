/** A file (and optionally a head-side line) the Files-changed view should bring into view. */
export interface DiffTarget {
  path: string;
  line: number | null;
}
