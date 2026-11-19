import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { retry } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";

/** Hooks for the trainer app. They live apart from `hooks.ts` so the member app’s first download does not carry them. */
/** The trainer app’s reads load with the trainer area, not with the member app or the marketing site. */
const trainerApi = () => import("@/api/trainer");

/** The trainer’s Today (T07): sessions, overdue reviews, missed workouts, expiring credits and clients waiting for a plan. */
export function useTrainerToday() {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "today"], queryFn: async () => (await trainerApi()).getTrainerToday(session), enabled: !!session, retry, staleTime: 15_000 });
}

const clientsApi = () => import("@/api/clients");

/** The trainer’s clients (T01), searched and filtered. The previous list stays on screen while a new search loads. */
export function useClients(params: import("@/api/clients").ClientListParams) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["trainer", session?.userId, "clients", params.search ?? "", params.flag ?? ""],
    queryFn: async () => (await clientsApi()).listClients(session, params),
    enabled: !!session,
    retry,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/** One client’s profile, for their trainer (T02, T05, T06, A02). */
export function useClient(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "client", memberId], queryFn: async () => (await clientsApi()).getClient(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 15_000 });
}

/** Writes a note only the trainer can read. */
export function useAddPrivateNote(memberId: string) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => (await clientsApi()).addPrivateNote(session, { memberId, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trainer", session?.userId, "client", memberId] }),
  });
}

const assessmentsApi = () => import("@/api/assessments");

/** A client’s assessments and goals (T02), for their trainer. Assessments are health data: they come through the audited door and need consent. */
export function useAssessment(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "assessment", memberId], queryFn: async () => (await assessmentsApi()).getAssessment(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
}

/** Everything that changes after an assessment or a goal is saved: the assessment screen, the client’s profile and Today. */
function useRefreshClient() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return () => Promise.all(["assessment", "client", "clients", "today", "review"].map((k) => queryClient.invalidateQueries({ queryKey: ["trainer", session?.userId, k] })));
}

export function useSaveAssessment() {
  const { session } = useSession();
  const refresh = useRefreshClient();
  return useMutation({ mutationFn: async (input: import("@/api/assessments").AssessmentInput) => (await assessmentsApi()).saveAssessment(session, input), onSuccess: refresh });
}

export function useGoalActions(memberId: string) {
  const { session } = useSession();
  const refresh = useRefreshClient();
  const api = assessmentsApi;
  return {
    create: useMutation({ mutationFn: async (i: import("@/api/assessments").GoalInput) => (await api()).createGoal(session, i), onSuccess: refresh }),
    revise: useMutation({ mutationFn: async (i: import("@/api/assessments").GoalInput & { goalId: string; reason: string }) => (await api()).reviseGoal(session, i), onSuccess: refresh }),
    close: useMutation({ mutationFn: async (i: { goalId: string; reason: string }) => (await api()).closeGoal(session, { memberId, ...i }), onSuccess: refresh }),
    achieve: useMutation({ mutationFn: async (i: { goalId: string; note?: string }) => (await api()).confirmGoalAchieved(session, { memberId, ...i }), onSuccess: refresh }),
  };
}

const libraryApi = () => import("@/api/library");

/** The exercise library (W01), searched and filtered. */
export function useExercises(params: import("@/api/library").LibraryParams) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["library", session?.userId, "list", params.search ?? "", params.category ?? "", params.muscle ?? "", params.equipment ?? "", !!params.archived],
    queryFn: async () => (await libraryApi()).listExercises(session, params),
    enabled: !!session,
    retry,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/** One exercise with its substitutes and where it is used. */
export function useExercise(id: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["library", session?.userId, "one", id], queryFn: async () => (await libraryApi()).getExercise(session, id!), enabled: !!session && !!id, retry, staleTime: 15_000 });
}

/** Saving or archiving an exercise changes the list, the detail and every picker. */
export function useExerciseActions() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["library", session?.userId] });
  return {
    save: useMutation({ mutationFn: async (i: import("@/api/library").ExerciseInput) => (await libraryApi()).saveExercise(session, i), onSuccess: refresh }),
    archive: useMutation({ mutationFn: async (i: { id: string; archived: boolean }) => (await libraryApi()).setExerciseArchived(session, i), onSuccess: refresh }),
  };
}

const programsApi = () => import("@/api/programs");
const templatesApi = () => import("@/api/templates");

/** What the builder opens with for a client: their current version, any draft, and the earliest start date. Always read fresh. */
export function useProgramSource(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "program", memberId], queryFn: async () => (await programsApi()).getProgramSource(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
}

/** Saving a draft, discarding it, and publishing. Publishing changes the client’s profile, Today and the clients list. */
export function useProgramActions() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const api = programsApi;
  const refresh = () => Promise.all(["client", "clients", "today", "program"].map((k) => queryClient.invalidateQueries({ queryKey: ["trainer", session?.userId, k] })));
  return {
    saveDraft: useMutation({ mutationFn: async (i: import("@/api/programs").ProgramInput) => (await api()).saveProgramDraft(session, i), retry, retryDelay: 400 }),
    discard: useMutation({ mutationFn: async (memberId: string) => (await api()).discardProgramDraft(session, memberId), onSuccess: refresh }),
    publish: useMutation({ mutationFn: async (i: import("@/api/programs").PublishInput) => (await api()).publishProgram(session, i), onSuccess: refresh }),
  };
}

/** The templates a trainer can start from: their own and the gym’s shared ones. */
export function useTemplates(archived = false) {
  const { session } = useSession();
  return useQuery({ queryKey: ["templates", session?.userId, "list", archived], queryFn: async () => (await templatesApi()).listTemplates(session, { archived }), enabled: !!session, retry, staleTime: 5_000 });
}
export function useTemplate(id: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["templates", session?.userId, "one", id], queryFn: async () => (await templatesApi()).getTemplate(session, id!), enabled: !!session && !!id, retry, staleTime: 0, gcTime: 0 });
}
export function useTemplateActions() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["templates", session?.userId] });
  return {
    save: useMutation({ mutationFn: async (i: import("@/api/templates").TemplateInput) => (await templatesApi()).saveTemplate(session, i), onSuccess: refresh }),
    archive: useMutation({ mutationFn: async (i: { id: string; archived: boolean }) => (await templatesApi()).setTemplateArchived(session, i), onSuccess: refresh }),
    share: useMutation({ mutationFn: async (i: { id: string; shared: boolean }) => (await templatesApi()).setTemplateShared(session, i), onSuccess: refresh }),
  };
}

/** Reads one template’s days on demand, when a trainer picks it. */
export function useTemplateLoader() {
  const { session } = useSession();
  return async (id: string) => (await templatesApi()).getTemplate(session, id);
}

const coachApi = () => import("@/api/coachLog");

/** Coach-led logging (T05): the client’s recent days, one day to log, and the three writes. */
export function useCoachDays(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "coach-days", memberId], queryFn: async () => (await coachApi()).getCoachDays(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 0 });
}

/** Read fresh every time, like the member’s workout: the logging screen copies it into its own state and saves from there. */
export function useCoachWorkout(memberId: string | undefined, date: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "coach-workout", memberId, date], queryFn: async () => (await coachApi()).getCoachWorkout(session, memberId!, date!), enabled: !!session && !!memberId && !!date, retry, staleTime: 0, gcTime: 0 });
}

export function useSaveCoachDraft() {
  const { session } = useSession();
  return useMutation({ mutationFn: async (input: import("@/api/coachLog").CoachDraftInput) => (await coachApi()).saveCoachDraft(session, input) });
}

export function useCoachFinish(memberId: string) {
  const { session } = useSession();
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["trainer", session?.userId, "coach-days", memberId] }), qc.invalidateQueries({ queryKey: ["trainer", session?.userId, "coach-workout", memberId] }), qc.invalidateQueries({ queryKey: ["trainer", session?.userId, "client", memberId] }), qc.invalidateQueries({ queryKey: ["trainer", session?.userId, "today"] })]);
  const submit = useMutation({ mutationFn: async (input: import("@/api/coachLog").CoachSubmitInput) => (await coachApi()).submitCoachWorkout(session, input), onSuccess: refresh });
  const correct = useMutation({ mutationFn: async (input: import("@/api/coachLog").CorrectionInput) => (await coachApi()).correctWorkout(session, input), onSuccess: refresh });
  return { submit, correct };
}

const reviewApi = () => import("@/api/review");

/** The review (T06, P04): adherence, trends, the latest check-in, goals and the history of what was written. */
export function useReview(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "review", memberId], queryFn: async () => (await reviewApi()).getReview(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 0 });
}

export function useSaveReview(memberId: string) {
  const { session } = useSession();
  const refresh = useRefreshClient();
  return useMutation({ mutationFn: async (input: import("@/api/review").ReviewInput) => (await reviewApi()).saveReview(session, input), onSuccess: () => refresh().then(() => undefined), meta: { memberId } });
}

const scheduleApi = () => import("@/api/schedule");

/** The trainer’s schedule (O01, O02, T04, M06): sessions, availability, shifts, leave and conflicts. */
export function useSchedule() {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "schedule"], queryFn: async () => (await scheduleApi()).getSchedule(session), enabled: !!session, retry, staleTime: 0 });
}

export function useScheduleActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const refresh = () => Promise.all(["schedule", "today", "conflict-options"].map((k) => qc.invalidateQueries({ queryKey: ["trainer", session?.userId, k] })));
  const run = <I, O>(fn: (api: typeof import("@/api/schedule"), input: I) => Promise<O>) => ({ mutationFn: async (input: I) => fn(await scheduleApi(), input), onSuccess: refresh });
  return {
    mark: useMutation(run((api, i: import("@/api/schedule").MarkInput) => api.markAttendance(session, i))),
    saveAvailability: useMutation(run((api, i: import("@/api/schedule").AvailabilityInput) => api.saveAvailability(session, i))),
    addShift: useMutation(run((api, i: import("@/api/schedule").ShiftInput) => api.addShift(session, i))),
    removeShift: useMutation(run((api, id: string) => api.removeShift(session, id))),
    addLeave: useMutation(run((api, i: import("@/api/schedule").LeaveInput) => api.addLeave(session, i))),
    cancelLeave: useMutation(run((api, id: string) => api.cancelLeave(session, id))),
    move: useMutation(run((api, i: import("@/api/schedule").MoveInput) => api.moveSession(session, i))),
  };
}

/** Where a session that clashes with leave can go. Read fresh: free times change. */
export function useConflictOptions(bookingId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "conflict-options", bookingId], queryFn: async () => (await scheduleApi()).getConflictOptions(session, bookingId!), enabled: !!session && !!bookingId, retry, staleTime: 0, gcTime: 0 });
}
