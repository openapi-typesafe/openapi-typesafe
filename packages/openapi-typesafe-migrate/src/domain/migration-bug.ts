/**
 * A migration that would corrupt a file: two edits or two strings of one file overlap, which
 * only a bug of the tool can cause. The file is left as it was and reported, and the other files
 * are still migrated: the bug of one reader must not hide the changes of all the others.
 */
export class MigrationBugError extends Error {
  override readonly name = "MigrationBugError";
}
