import type { Organization, Paper } from '@/lib/types';

// Display helpers for translated names. When a Chinese translation exists it is
// preferred; otherwise the original text is used as a fallback. Person names are
// intentionally NOT handled here — they keep their existing chinese_name /
// english_name logic and never enter the translation flow.

export function displayOrganizationName(
  organization: Pick<Organization, 'name' | 'name_zh' | 'english_name'>,
): string {
  return (
    organization.name_zh?.trim() ||
    organization.name?.trim() ||
    organization.english_name?.trim() ||
    ''
  );
}

export function displayPaperTitle(
  paper: Pick<Paper, 'title' | 'title_zh'>,
): string {
  return paper.title_zh?.trim() || paper.title?.trim() || '';
}
