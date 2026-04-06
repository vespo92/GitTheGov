import type {
  Pod,
  CoordinationRequest,
  LocalLegislation,
  ForumTopic,
  ForumPost,
  CommunityEvent,
} from '@/types';

export const mockPods: Pod[] = [
  {
    id: 'pod-ca-sf',
    name: 'San Francisco Bay Area',
    code: 'CA-SF',
    type: 'regional',
    status: 'active',
    boundaries: {
      type: 'Polygon',
      coordinates: [[[-122.5, 37.7], [-122.3, 37.7], [-122.3, 37.85], [-122.5, 37.85], [-122.5, 37.7]]],
    },
    population: 4727357,
    leadership: [
      { id: 'l1', name: 'Maria Chen', role: 'coordinator', since: new Date('2024-01-15') },
      { id: 'l2', name: 'James Wilson', role: 'council_member', since: new Date('2024-01-15') },
      { id: 'l3', name: 'Sarah Johnson', role: 'treasurer', since: new Date('2024-02-01') },
    ],
    createdAt: new Date('2024-01-01'),
    description: 'The San Francisco Bay Area regional pod encompasses nine counties around the San Francisco Bay.',
    headquarters: 'San Francisco, CA',
    metrics: {
      tblScore: { people: 78, planet: 82, profit: 85, overall: 81.7 },
      citizenSatisfaction: 76,
      participationRate: 68,
      legislationPassed: 23,
      resourceEfficiency: 81,
    },
  },
  {
    id: 'pod-tx-aus',
    name: 'Austin Metro',
    code: 'TX-AUS',
    type: 'municipal',
    status: 'active',
    boundaries: {
      type: 'Polygon',
      coordinates: [[[-97.9, 30.2], [-97.6, 30.2], [-97.6, 30.45], [-97.9, 30.45], [-97.9, 30.2]]],
    },
    population: 2283371,
    leadership: [
      { id: 'l4', name: 'Robert Garcia', role: 'coordinator', since: new Date('2024-02-01') },
      { id: 'l5', name: 'Emily Davis', role: 'secretary', since: new Date('2024-02-15') },
    ],
    createdAt: new Date('2024-02-01'),
    description: 'Austin Metro pod covering the greater Austin metropolitan area in central Texas.',
    headquarters: 'Austin, TX',
    metrics: {
      tblScore: { people: 75, planet: 70, profit: 88, overall: 77.7 },
      citizenSatisfaction: 72,
      participationRate: 65,
      legislationPassed: 18,
      resourceEfficiency: 78,
    },
  },
  {
    id: 'pod-ny-nyc',
    name: 'New York City',
    code: 'NY-NYC',
    type: 'municipal',
    status: 'active',
    boundaries: {
      type: 'Polygon',
      coordinates: [[[-74.1, 40.6], [-73.8, 40.6], [-73.8, 40.9], [-74.1, 40.9], [-74.1, 40.6]]],
    },
    population: 8336817,
    leadership: [
      { id: 'l6', name: 'David Kim', role: 'coordinator', since: new Date('2024-01-01') },
      { id: 'l7', name: 'Angela Martinez', role: 'council_member', since: new Date('2024-01-01') },
      { id: 'l8', name: 'Michael Brown', role: 'representative', since: new Date('2024-03-01') },
    ],
    createdAt: new Date('2024-01-01'),
    description: 'New York City pod encompassing all five boroughs.',
    headquarters: 'New York, NY',
    metrics: {
      tblScore: { people: 72, planet: 68, profit: 92, overall: 77.3 },
      citizenSatisfaction: 68,
      participationRate: 58,
      legislationPassed: 31,
      resourceEfficiency: 75,
    },
  },
  {
    id: 'pod-wa-sea',
    name: 'Seattle-Puget Sound',
    code: 'WA-SEA',
    type: 'regional',
    status: 'active',
    boundaries: {
      type: 'Polygon',
      coordinates: [[[-122.5, 47.4], [-122.1, 47.4], [-122.1, 47.8], [-122.5, 47.8], [-122.5, 47.4]]],
    },
    population: 3939363,
    leadership: [
      { id: 'l9', name: 'Jennifer Lee', role: 'coordinator', since: new Date('2024-01-15') },
    ],
    createdAt: new Date('2024-01-15'),
    description: 'Seattle-Puget Sound regional pod covering the greater Seattle metropolitan area.',
    headquarters: 'Seattle, WA',
    metrics: {
      tblScore: { people: 80, planet: 85, profit: 82, overall: 82.3 },
      citizenSatisfaction: 79,
      participationRate: 72,
      legislationPassed: 19,
      resourceEfficiency: 84,
    },
  },
  {
    id: 'pod-co-den',
    name: 'Denver Metro',
    code: 'CO-DEN',
    type: 'municipal',
    status: 'forming',
    boundaries: {
      type: 'Polygon',
      coordinates: [[[-105.1, 39.6], [-104.8, 39.6], [-104.8, 39.9], [-105.1, 39.9], [-105.1, 39.6]]],
    },
    population: 2897118,
    leadership: [
      { id: 'l10', name: 'Chris Anderson', role: 'coordinator', since: new Date('2024-06-01') },
    ],
    createdAt: new Date('2024-06-01'),
    description: 'Denver Metro pod currently forming, covering the greater Denver area.',
    headquarters: 'Denver, CO',
    metrics: {
      tblScore: { people: 70, planet: 75, profit: 80, overall: 75 },
      citizenSatisfaction: 65,
      participationRate: 45,
      legislationPassed: 5,
      resourceEfficiency: 70,
    },
  },
];

export const mockCoordinationRequests: CoordinationRequest[] = [
  {
    id: 'coord-1',
    type: 'resource_sharing',
    status: 'pending',
    requestingPod: 'pod-ca-sf',
    requestingPodName: 'San Francisco Bay Area',
    targetPods: ['pod-wa-sea'],
    targetPodNames: ['Seattle-Puget Sound'],
    title: 'Water Resource Sharing Agreement',
    description: 'Proposal for sharing water management best practices and emergency resources between West Coast pods.',
    resources: [
      { type: 'expertise', description: 'Water conservation specialists', quantity: 5 },
      { type: 'equipment', description: 'Emergency water purification units', quantity: 10 },
    ],
    timeline: {
      proposedStart: new Date('2025-01-01'),
      proposedEnd: new Date('2025-12-31'),
      milestones: [
        { id: 'm1', title: 'Initial Assessment', dueDate: new Date('2025-02-01'), completed: false },
        { id: 'm2', title: 'Resource Allocation', dueDate: new Date('2025-04-01'), completed: false },
      ],
    },
    votes: [
      { podId: 'pod-ca-sf', podName: 'San Francisco Bay Area', vote: 'approve', votedAt: new Date() },
      { podId: 'pod-wa-sea', podName: 'Seattle-Puget Sound', vote: 'pending' },
    ],
    createdAt: new Date('2024-11-01'),
    updatedAt: new Date('2024-11-15'),
    createdBy: 'Maria Chen',
  },
  {
    id: 'coord-2',
    type: 'joint_initiative',
    status: 'accepted',
    requestingPod: 'pod-tx-aus',
    requestingPodName: 'Austin Metro',
    targetPods: ['pod-co-den'],
    targetPodNames: ['Denver Metro'],
    title: 'Tech Corridor Development',
    description: 'Joint initiative to establish a technology and innovation corridor connecting Austin and Denver metros.',
    timeline: {
      proposedStart: new Date('2025-03-01'),
      proposedEnd: new Date('2027-12-31'),
    },
    votes: [
      { podId: 'pod-tx-aus', podName: 'Austin Metro', vote: 'approve', votedAt: new Date('2024-10-15') },
      { podId: 'pod-co-den', podName: 'Denver Metro', vote: 'approve', votedAt: new Date('2024-10-20') },
    ],
    createdAt: new Date('2024-10-01'),
    updatedAt: new Date('2024-10-20'),
    createdBy: 'Robert Garcia',
  },
];

export const mockLegislation: LocalLegislation[] = [
  {
    id: 'leg-1',
    title: 'Green Building Standards Act',
    summary: 'Establishes minimum environmental standards for new construction within the pod.',
    content: '## Section 1: Purpose\n\nThis act establishes green building standards...',
    scope: 'local',
    status: 'voting',
    podId: 'pod-ca-sf',
    podName: 'San Francisco Bay Area',
    sponsor: 'Maria Chen',
    cosponsors: ['James Wilson'],
    introducedAt: new Date('2024-11-01'),
    votingEnds: new Date('2024-12-01'),
    votes: { for: 1250, against: 340, abstain: 85 },
    constitutionalCompliance: {
      isCompliant: true,
      score: 95,
      reviewedAt: new Date('2024-11-05'),
    },
    impactAssessment: {
      economicImpact: 'positive_moderate',
      socialImpact: 'positive_high',
      environmentalImpact: 'positive_high',
      affectedPopulation: 4727357,
      summary: 'Expected to significantly reduce carbon footprint while creating green jobs.',
    },
    versions: [
      { version: '1.0', content: 'Initial draft...', createdAt: new Date('2024-11-01'), createdBy: 'Maria Chen', changes: 'Initial submission' },
    ],
  },
  {
    id: 'leg-2',
    title: 'Community Transit Expansion',
    summary: 'Funding proposal for expanding public transit routes to underserved areas.',
    content: '## Section 1: Overview\n\nThis legislation allocates funding...',
    scope: 'regional',
    status: 'review',
    podId: 'pod-ny-nyc',
    podName: 'New York City',
    sponsor: 'David Kim',
    introducedAt: new Date('2024-11-10'),
    votes: { for: 0, against: 0, abstain: 0 },
    constitutionalCompliance: {
      isCompliant: true,
      score: 88,
    },
    versions: [
      { version: '1.0', content: 'Initial draft...', createdAt: new Date('2024-11-10'), createdBy: 'David Kim', changes: 'Initial submission' },
    ],
  },
];

export const mockForumTopics: ForumTopic[] = [
  { id: 'topic-1', name: 'General Discussion', description: 'General community discussions', postCount: 156 },
  { id: 'topic-2', name: 'Local Issues', description: 'Discuss local pod issues', postCount: 89 },
  { id: 'topic-3', name: 'Policy Proposals', description: 'Discuss and propose new policies', postCount: 45 },
  { id: 'topic-4', name: 'Events & Meetups', description: 'Community events and gatherings', postCount: 32 },
];

export const mockForumPosts: ForumPost[] = [
  {
    id: 'post-1',
    title: 'Thoughts on the new green building standards?',
    content: 'I wanted to hear what everyone thinks about the proposed Green Building Standards Act...',
    authorId: 'user-1',
    authorName: 'Alex Thompson',
    podId: 'pod-ca-sf',
    topicId: 'topic-3',
    createdAt: new Date('2024-11-15'),
    replies: 12,
    tags: ['legislation', 'environment'],
  },
  {
    id: 'post-2',
    title: 'Community cleanup day this Saturday!',
    content: 'Join us for our monthly community cleanup at Golden Gate Park...',
    authorId: 'user-2',
    authorName: 'Sarah Miller',
    podId: 'pod-ca-sf',
    topicId: 'topic-4',
    createdAt: new Date('2024-11-18'),
    replies: 8,
    isPinned: true,
    tags: ['event', 'volunteer'],
  },
];

export const mockEvents: CommunityEvent[] = [
  {
    id: 'event-1',
    title: 'Monthly Town Hall',
    description: 'Join us for our monthly town hall meeting to discuss pod updates and community concerns.',
    type: 'town_hall',
    podId: 'pod-ca-sf',
    location: 'San Francisco City Hall',
    isVirtual: true,
    virtualLink: 'https://meet.example.com/townhall',
    startTime: new Date('2024-12-01T18:00:00'),
    endTime: new Date('2024-12-01T20:00:00'),
    attendees: 234,
    organizer: 'Maria Chen',
    status: 'upcoming',
  },
  {
    id: 'event-2',
    title: 'Community Volunteer Day',
    description: 'Help beautify our neighborhood parks and public spaces.',
    type: 'volunteer',
    podId: 'pod-ca-sf',
    location: 'Golden Gate Park',
    isVirtual: false,
    startTime: new Date('2024-11-23T09:00:00'),
    endTime: new Date('2024-11-23T14:00:00'),
    attendees: 78,
    maxAttendees: 100,
    organizer: 'Sarah Miller',
    status: 'upcoming',
  },
];

// Label mappings
export const podTypeLabels: Record<string, string> = {
  municipal: 'Municipal',
  county: 'County',
  regional: 'Regional',
  state: 'State',
};

export const podStatusLabels: Record<string, string> = {
  active: 'Active',
  forming: 'Forming',
  merging: 'Merging',
  dissolved: 'Dissolved',
};

export const coordinationTypeLabels: Record<string, string> = {
  resource_sharing: 'Resource Sharing',
  joint_initiative: 'Joint Initiative',
  conflict_resolution: 'Conflict Resolution',
  boundary_adjustment: 'Boundary Adjustment',
  policy_alignment: 'Policy Alignment',
  emergency_response: 'Emergency Response',
};

export const coordinationStatusLabels: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  accepted: 'Accepted',
  negotiating: 'Negotiating',
  completed: 'Completed',
  rejected: 'Rejected',
  expired: 'Expired',
};

export const legislationStatusLabels: Record<string, string> = {
  draft: 'Draft',
  review: 'Under Review',
  voting: 'Voting',
  passed: 'Passed',
  rejected: 'Rejected',
  enacted: 'Enacted',
  repealed: 'Repealed',
};
