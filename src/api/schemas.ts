import { z } from 'zod'

export const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().nullable(),
  timestamp: z.string(),
  path: z.string(),
  requestId: z.string(),
})

export const HealthSchema = z.object({
  status: z.string(),
  service: z.string(),
  time: z.string(),
})

export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  displayName: z.string(),
})

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
})

export const LoginResponseSchema = TokenPairSchema.extend({
  user: UserSchema,
})

export const RegisterResponseSchema = LoginResponseSchema.extend({
  team: z.object({
    code: z.string(),
    name: z.string(),
  }),
})

export const PermissionSchema = z.enum([
  'files:read',
  'files:refine',
  'refiners:read',
  'refiners:write',
  'media:upload',
  'incidents:read',
  'incidents:create',
  'team:manage',
])

export const MeSchema = z.object({
  id: z.number(),
  email: z.string(),
  displayName: z.string(),
  team: z.object({
    code: z.string(),
    name: z.string(),
  }),
  role: z.object({
    code: z.string(),
    name: z.string(),
  }),
  permissions: z.array(PermissionSchema),
  clearance: z.object({
    granted: z.boolean(),
    grantedAt: z.string().nullable(),
  }),
})

export const RoleSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  permissions: z.array(PermissionSchema),
})

export const MemberSchema = z.object({
  id: z.number(),
  email: z.string(),
  displayName: z.string(),
  role: z.object({
    code: z.string(),
    name: z.string(),
  }),
})

export const ProgressSchema = z.object({
  WO: z.number(),
  FC: z.number(),
  DR: z.number(),
  MA: z.number(),
  overall: z.number(),
})

export const FileSchema = z.object({
  id: z.number(),
  name: z.string(),
  rows: z.number(),
  cols: z.number(),
  tileSize: z.number(),
  status: z.enum(['ACTIVE', 'COMPLETE']),
  progress: ProgressSchema,
  refinedGroups: z.number(),
  totalGroups: z.number(),
  mistakes: z.number(),
  updatedAt: z.string(),
})

export const FilePageSchema = z.object({
  content: z.array(FileSchema),
  totalElements: z.number(),
  totalPages: z.number(),
  page: z.number(),
  size: z.number(),
})

export const RulesSchema = z.object({
  tremorThreshold: z.number(),
  connectivity: z.union([z.literal(4), z.literal(8)]),
  minGroupSize: z.number(),
  maxGroupSize: z.number(),
  binning: z.object({
    strategy: z.enum(['DIGIT_SUM_MOD', 'MAX_DIGIT_MOD']),
    order: z.array(z.enum(['WO', 'FC', 'DR', 'MA'])),
  }),
})

export const TileSchema = z.object({
  tileRow: z.number(),
  tileCol: z.number(),
  originRow: z.number(),
  originCol: z.number(),
  rows: z.number(),
  cols: z.number(),
  values: z.string(),
  tremor: z.string(),
  bins: z.string(),
  version: z.number(),
})

export const RefineResultSchema = z.object({
  refinementId: z.number(),
  bin: z.enum(['WO', 'FC', 'DR', 'MA']),
  size: z.number(),
  file: z.object({
    progress: ProgressSchema,
    refinedGroups: z.number(),
    totalGroups: z.number(),
    mistakes: z.number(),
    status: z.enum(['ACTIVE', 'COMPLETE']),
  }),
})

export const CheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
})

export const ClearanceCheckResultSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.string().nullable(),
  checks: z.array(CheckSchema),
})

export const RosterMemberSchema = z.object({
  name: z.string(),
  code: z.string(),
})

export const RosterSchema = z.object({
  members: z.array(RosterMemberSchema),
  complete: z.boolean(),
  locked: z.boolean(),
})

export const ClearanceSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.string().nullable(),
  checks: z.array(CheckSchema),
  checkedAt: z.string().nullable(),
  workspace: z.object({
    kind: z.enum(['DEV', 'EVAL']),
    chaosLevel: z.number(),
  }),
  roster: RosterSchema,
  round: z.object({
    approved: z.boolean(),
    approvedAt: z.string().nullable(),
    approvedRound: z.number().nullable(),
    nextRoundAt: z.string().nullable(),
    drawnMember: z
      .object({
        round: z.number(),
        name: z.string(),
        code: z.string(),
        startsAt: z.string(),
      })
      .nullable(),
    attempts: z.array(
      z.object({
        round: z.number(),
        startsAt: z.string(),
        member: RosterMemberSchema,
        result: z.enum(['PASSED', 'FAILED', 'ABSENT']).nullable(),
        gradedAt: z.string().nullable(),
      }),
    ),
    schedule: z.array(
      z.object({
        number: z.number(),
        startsAt: z.string(),
        drawAt: z.string(),
        drawnAt: z.string().nullable(),
        resultsPublishedAt: z.string().nullable(),
      }),
    ),
  }),
})

export const DepartmentSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
})

export const RefinerSchema = z.object({
  id: z.number(),
  fullName: z.string(),
  department: DepartmentSchema,
  title: z.string(),
  extension: z.string(),
  bio: z.string(),
  profileUrl: z.string().nullable(),
  badge: z
    .object({
      url: z.string(),
      width: z.number(),
      height: z.number(),
    })
    .nullable(),
  version: z.number(),
  updatedAt: z.string(),
})

export const RefinerPageSchema = z.object({
  content: z.array(RefinerSchema),
  totalElements: z.number(),
  totalPages: z.number(),
  page: z.number(),
  size: z.number(),
})

export const MediaTicketSchema = z.object({
  ticketId: z.string(),
  expiresAt: z.string(),
  provider: z.enum(['SUPABASE', 'CLOUDINARY']),
  objectPath: z.string().optional(),
  bucket: z.string().optional(),
  uploadPublicId: z.string().optional(),
  expectedPublicId: z.string().optional(),
  constraints: z.object({
    contentType: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    minLongSide: z.number().optional(),
    maxLongSide: z.number().optional(),
    maxBytes: z.number().optional(),
  }),
})

export const MediaSchema = z.object({
  mediaId: z.number(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  purpose: z.enum(['BADGE', 'INCIDENT']),
})

export const IncidentSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  fileId: z.number().nullable(),
  file: z.object({ id: z.number(), name: z.string() }).nullable(),
  photos: z.array(
    z.object({
      mediaId: z.number(),
      url: z.string(),
      width: z.number(),
      height: z.number(),
    }),
  ),
  createdBy: z.object({
    id: z.number(),
    displayName: z.string(),
  }),
  createdAt: z.string(),
})

export const IncidentPageSchema = z.object({
  content: z.array(IncidentSchema),
  totalElements: z.number(),
  totalPages: z.number(),
  page: z.number(),
  size: z.number(),
})

export const StreamTicketSchema = z.object({
  ticket: z.string(),
  expiresIn: z.number(),
})

export const FloorTicketSchema = z.object({
  ticket: z.string(),
  expiresIn: z.number(),
})

export const DeployChallengeSchema = z.object({
  origin: z.string(),
  token: z.string(),
  wellKnownPath: z.string(),
  expiresAt: z.string(),
})

export const DeployVerifiedSchema = z.object({
  origin: z.string(),
  verifiedAt: z.string(),
})

export const StorageResultSchema = z.object({
  provider: z.enum(['SUPABASE', 'CLOUDINARY']),
  verifiedAt: z.string(),
  checks: z.array(CheckSchema),
})

export const IntegrationStatusSchema = z.object({
  deploy: z.object({
    origin: z.string().nullable(),
    verifiedAt: z.string().nullable(),
    lastBuildSeen: z.string().nullable(),
    lastBuildSeenAt: z.string().nullable(),
    pendingChallenge: z
      .object({
        origin: z.string(),
        expiresAt: z.string(),
      })
      .nullable(),
  }),
  storage: z.object({
    provider: z.enum(['SUPABASE', 'CLOUDINARY']).nullable(),
    verifiedAt: z.string().nullable(),
    checks: z.array(CheckSchema),
    config: z
      .object({
        projectUrl: z.string().optional(),
        bucket: z.string().optional(),
        cloudName: z.string().optional(),
        uploadPreset: z.string().optional(),
      })
      .nullable(),
  }),
  clearance: z.object({
    granted: z.boolean(),
    grantedAt: z.string().nullable(),
  }),
})

export type ApiErrorBody = z.infer<typeof ErrorSchema>
export type User = z.infer<typeof UserSchema>
export type Permission = z.infer<typeof PermissionSchema>
export type Me = z.infer<typeof MeSchema>
export type Role = z.infer<typeof RoleSchema>
export type TeamMember = z.infer<typeof MemberSchema>
export type Progress = z.infer<typeof ProgressSchema>
export type DataFile = z.infer<typeof FileSchema>
export type FilePage = z.infer<typeof FilePageSchema>
export type Rules = z.infer<typeof RulesSchema>
export type Tile = z.infer<typeof TileSchema>
export type RefineResult = z.infer<typeof RefineResultSchema>
export type Clearance = z.infer<typeof ClearanceSchema>
export type ClearanceCheckResult = z.infer<typeof ClearanceCheckResultSchema>
export type Roster = z.infer<typeof RosterSchema>
export type Department = z.infer<typeof DepartmentSchema>
export type Refiner = z.infer<typeof RefinerSchema>
export type RefinerPage = z.infer<typeof RefinerPageSchema>
export type MediaTicket = z.infer<typeof MediaTicketSchema>
export type Media = z.infer<typeof MediaSchema>
export type Incident = z.infer<typeof IncidentSchema>
export type IncidentPage = z.infer<typeof IncidentPageSchema>
export type StreamTicket = z.infer<typeof StreamTicketSchema>
export type FloorTicket = z.infer<typeof FloorTicketSchema>
export type DeployChallenge = z.infer<typeof DeployChallengeSchema>
export type StorageResult = z.infer<typeof StorageResultSchema>
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>
