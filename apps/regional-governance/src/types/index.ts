// Core Pod Types
export interface Pod {
  id: string;
  name: string;
  code: string; // e.g., "CA-SF", "TX-AUS"
  type: PodType;
  status: PodStatus;
  boundaries: GeoJSONPolygon;
  population: number;
  leadership: Leader[];
  parentPod?: string;
  childPods?: string[];
  createdAt: Date;
  metrics: PodMetrics;
  description?: string;
  timezone?: string;
  headquarters?: string;
}

export type PodType = 'municipal' | 'county' | 'regional' | 'state';
export type PodStatus = 'active' | 'forming' | 'merging' | 'dissolved';

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface Leader {
  id: string;
  name: string;
  role: LeaderRole;
  avatar?: string;
  email?: string;
  since: Date;
  term?: {
    start: Date;
    end: Date;
  };
}

export type LeaderRole = 'coordinator' | 'council_member' | 'secretary' | 'treasurer' | 'representative';

export interface PodMetrics {
  tblScore: TBLScore;
  citizenSatisfaction: number; // 0-100
  participationRate: number; // 0-100
  legislationPassed: number;
  resourceEfficiency: number; // 0-100
  economicGrowth?: number;
  environmentalScore?: number;
  socialWellbeing?: number;
}

export interface TBLScore {
  people: number; // 0-100
  planet: number; // 0-100
  profit: number; // 0-100
  overall: number; // Weighted average
}

// Coordination Types
export interface CoordinationRequest {
  id: string;
  type: CoordinationType;
  status: CoordinationStatus;
  requestingPod: string;
  requestingPodName?: string;
  targetPods: string[];
  targetPodNames?: string[];
  title: string;
  description: string;
  resources?: ResourceRequest[];
  timeline: Timeline;
  votes: PodVote[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type CoordinationType =
  | 'resource_sharing'
  | 'joint_initiative'
  | 'conflict_resolution'
  | 'boundary_adjustment'
  | 'policy_alignment'
  | 'emergency_response';

export type CoordinationStatus =
  | 'draft'
  | 'pending'
  | 'accepted'
  | 'negotiating'
  | 'completed'
  | 'rejected'
  | 'expired';

export interface ResourceRequest {
  type: 'funding' | 'personnel' | 'equipment' | 'expertise' | 'infrastructure';
  description: string;
  quantity?: number;
  unit?: string;
  estimatedValue?: number;
}

export interface Timeline {
  proposedStart: Date;
  proposedEnd: Date;
  milestones?: Milestone[];
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: Date;
  completed: boolean;
  completedAt?: Date;
}

export interface PodVote {
  podId: string;
  podName: string;
  vote: 'approve' | 'reject' | 'abstain' | 'pending';
  votedAt?: Date;
  comments?: string;
}

// Legislation Types
export interface LocalLegislation {
  id: string;
  title: string;
  summary: string;
  content: string;
  scope: LegislationScope;
  status: LegislationStatus;
  podId: string;
  podName: string;
  sponsor: string;
  cosponsors?: string[];
  introducedAt: Date;
  votingEnds?: Date;
  votes: {
    for: number;
    against: number;
    abstain: number;
  };
  constitutionalCompliance: ConstitutionalCompliance;
  impactAssessment?: ImpactAssessment;
  versions: LegislationVersion[];
}

export type LegislationScope = 'local' | 'regional' | 'inter_pod' | 'state';
export type LegislationStatus = 'draft' | 'review' | 'voting' | 'passed' | 'rejected' | 'enacted' | 'repealed';

export interface ConstitutionalCompliance {
  isCompliant: boolean;
  score: number; // 0-100
  issues?: string[];
  reviewedAt?: Date;
  reviewedBy?: string;
}

export interface ImpactAssessment {
  economicImpact: ImpactLevel;
  socialImpact: ImpactLevel;
  environmentalImpact: ImpactLevel;
  affectedPopulation: number;
  summary: string;
}

export type ImpactLevel = 'positive_high' | 'positive_moderate' | 'neutral' | 'negative_moderate' | 'negative_high';

export interface LegislationVersion {
  version: string;
  content: string;
  createdAt: Date;
  createdBy: string;
  changes: string;
}

// Community Types
export interface ForumPost {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  podId: string;
  topicId: string;
  createdAt: Date;
  updatedAt?: Date;
  replies: number;
  isPinned?: boolean;
  isLocked?: boolean;
  tags?: string[];
}

export interface ForumTopic {
  id: string;
  name: string;
  description: string;
  icon?: string;
  postCount: number;
  lastActivity?: Date;
  moderators?: string[];
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  podId: string;
  location?: string;
  isVirtual: boolean;
  virtualLink?: string;
  startTime: Date;
  endTime: Date;
  attendees: number;
  maxAttendees?: number;
  organizer: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
}

export type EventType = 'town_hall' | 'community_meeting' | 'workshop' | 'volunteer' | 'celebration' | 'emergency';

export interface FeedbackItem {
  id: string;
  type: 'suggestion' | 'complaint' | 'question' | 'praise';
  subject: string;
  content: string;
  authorId: string;
  podId: string;
  status: 'submitted' | 'under_review' | 'addressed' | 'closed';
  createdAt: Date;
  response?: string;
  respondedAt?: Date;
  respondedBy?: string;
}

// User Types
export interface RegionalUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  primaryPod: string;
  memberPods: string[];
  role: UserRole;
  permissions: Permission[];
  joinedAt: Date;
}

export type UserRole = 'citizen' | 'pod_member' | 'pod_leadership' | 'regional_coordinator' | 'admin';

export type Permission =
  | 'view_pods'
  | 'vote_local'
  | 'vote_regional'
  | 'create_legislation'
  | 'manage_pod'
  | 'coordinate_regions'
  | 'admin_all';

// Map Types
export interface MapFilters {
  podTypes: PodType[];
  podStatuses: PodStatus[];
  colorBy: MetricColorBy;
  showLabels: boolean;
  showBoundaries: boolean;
  minPopulation?: number;
  maxPopulation?: number;
}

export type MetricColorBy = 'tblScore' | 'population' | 'participationRate' | 'citizenSatisfaction' | 'resourceEfficiency';

// API Response Types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
