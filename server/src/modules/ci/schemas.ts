import { z } from 'zod';
import {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRefreshInput,
  CiRefreshResult,
  CiRemoveResult,
  CiRun,
  CiRunsQuery,
} from '@devdigest/shared';

/** Route-edge schemas of the ci module; the shapes themselves are the shared contracts. */
export {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRefreshInput,
  CiRefreshResult,
  CiRemoveResult,
  CiRun,
  CiRunsQuery,
};

export const CiInstallationList = z.array(CiInstallation);
export const CiRunList = z.array(CiRun);

/** `POST /ci/installations/:id/remove` takes no body; `.nullish()` tolerates "no body sent". */
export const RemoveBody = z.object({}).passthrough().nullish();
