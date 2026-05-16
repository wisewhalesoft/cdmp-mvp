import { SetMetadata } from '@nestjs/common';

/**
 * E07 業務角色 marker decorators（AD-E07 v3.0 / architecture-spec.md §E07 Guard 清單）
 *
 * 對應 Guard：
 *   - @RequireDirector()              → DirectorGuard（部長專屬功能）
 *   - @RequireSectionChief()          → SectionChiefGuard（處長專用端點）
 *   - @RequireDirectorOrSectionChief()→ DirectorOrSectionChiefGuard（E07 一般入口；admin 一律放行）
 *
 * 用法：
 *   @UseGuards(AuthGuard, DirectorOrSectionChiefGuard)
 *   @RequireDirectorOrSectionChief()
 *   @Get('/api/v1/assignment/list-definitions')
 */
export const REQUIRE_DIRECTOR_KEY = 'requireDirector';
export const REQUIRE_SECTION_CHIEF_KEY = 'requireSectionChief';
export const REQUIRE_DIRECTOR_OR_SECTION_CHIEF_KEY = 'requireDirectorOrSectionChief';

export const RequireDirector = () => SetMetadata(REQUIRE_DIRECTOR_KEY, true);
export const RequireSectionChief = () => SetMetadata(REQUIRE_SECTION_CHIEF_KEY, true);
export const RequireDirectorOrSectionChief = () =>
  SetMetadata(REQUIRE_DIRECTOR_OR_SECTION_CHIEF_KEY, true);
