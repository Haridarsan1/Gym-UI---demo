import type { Exercise } from "@/domain/types";

type Row = [id: string, name: string, category: Exercise["category"], muscles: string[], equipment: string[], instructions: string, substitutes: string[]];

const rows: Row[] = [
  ["ex_bench_press", "Barbell bench press", "strength", ["chest", "triceps", "shoulders"], ["barbell", "bench"], "Lie on the bench with your eyes under the bar. Lower the bar to your mid-chest with control, then press it up until your arms are straight. Keep your feet flat and your shoulder blades pinched.", ["ex_db_bench", "ex_pushup"]],
  ["ex_db_bench", "Dumbbell bench press", "strength", ["chest", "triceps"], ["dumbbells", "bench"], "Press the dumbbells up over your chest, lower them until your elbows are just below the bench, then press back up.", ["ex_pushup"]],
  ["ex_pushup", "Push-up", "strength", ["chest", "triceps", "core"], [], "Hands under your shoulders, body in a straight line. Lower your chest to the floor and push back up.", ["ex_db_bench"]],
  ["ex_incline_db", "Incline dumbbell press", "strength", ["chest", "shoulders"], ["dumbbells", "bench"], "Set the bench to a low incline. Press the dumbbells up and slightly together, then lower with control.", ["ex_db_bench"]],
  ["ex_ohp", "Overhead press", "strength", ["shoulders", "triceps"], ["barbell"], "Stand tall with the bar at your shoulders. Squeeze your glutes, press the bar straight up past your face, and lock out overhead.", ["ex_db_ohp"]],
  ["ex_db_ohp", "Seated dumbbell press", "strength", ["shoulders", "triceps"], ["dumbbells", "bench"], "Sit with your back supported. Press the dumbbells overhead and lower them to ear height.", ["ex_ohp"]],
  ["ex_lateral_raise", "Lateral raise", "strength", ["shoulders"], ["dumbbells"], "With a slight bend in your elbows, raise the dumbbells out to the sides to shoulder height, then lower slowly.", []],
  ["ex_tricep_pushdown", "Triceps pushdown", "strength", ["triceps"], ["cable"], "Elbows tucked at your sides. Push the handle down until your arms are straight, then let it rise slowly.", []],
  ["ex_deadlift", "Deadlift", "strength", ["back", "glutes", "hamstrings"], ["barbell"], "Bar over mid-foot. Hinge at the hips, grip the bar, flatten your back, and stand up by pushing the floor away. Lower the bar along your legs.", ["ex_rdl"]],
  ["ex_rdl", "Romanian deadlift", "strength", ["hamstrings", "glutes"], ["barbell"], "Soft knees. Push your hips back and slide the bar down your thighs until you feel your hamstrings stretch, then drive your hips forward.", []],
  ["ex_barbell_row", "Barbell row", "strength", ["back", "biceps"], ["barbell"], "Hinge forward with a flat back. Pull the bar to your lower ribs, squeeze your shoulder blades, and lower with control.", ["ex_db_row"]],
  ["ex_db_row", "One-arm dumbbell row", "strength", ["back", "biceps"], ["dumbbells", "bench"], "One hand on the bench. Pull the dumbbell to your hip, keeping your back flat, then lower it fully.", ["ex_barbell_row"]],
  ["ex_lat_pulldown", "Lat pulldown", "strength", ["back", "biceps"], ["cable"], "Pull the bar to your upper chest, leading with your elbows. Let it rise until your arms are straight.", ["ex_pullup"]],
  ["ex_pullup", "Pull-up", "strength", ["back", "biceps"], ["pull-up bar"], "Hang with your hands just outside your shoulders. Pull until your chin passes the bar, then lower fully.", ["ex_lat_pulldown"]],
  ["ex_face_pull", "Face pull", "strength", ["shoulders", "back"], ["cable"], "Pull the rope towards your face, elbows high, and rotate your hands apart at the end.", []],
  ["ex_bicep_curl", "Dumbbell curl", "strength", ["biceps"], ["dumbbells"], "Elbows at your sides. Curl the dumbbells up, squeeze, and lower slowly.", []],
  ["ex_back_squat", "Back squat", "strength", ["quads", "glutes"], ["barbell", "rack"], "Bar on your upper back. Sit down and back until your thighs are at least parallel, keeping your chest up, then stand.", ["ex_goblet_squat", "ex_leg_press"]],
  ["ex_goblet_squat", "Goblet squat", "strength", ["quads", "glutes"], ["dumbbells"], "Hold a dumbbell at your chest. Squat down between your knees and stand back up.", ["ex_leg_press"]],
  ["ex_leg_press", "Leg press", "strength", ["quads", "glutes"], ["machine"], "Feet shoulder-width on the platform. Lower until your knees are at about 90 degrees, then press without locking out.", ["ex_goblet_squat"]],
  ["ex_lunge", "Walking lunge", "strength", ["quads", "glutes"], ["dumbbells"], "Step forward and lower your back knee towards the floor, then push through your front foot into the next step.", []],
  ["ex_leg_curl", "Leg curl", "strength", ["hamstrings"], ["machine"], "Curl the pad towards your glutes, then lower slowly.", []],
  ["ex_calf_raise", "Standing calf raise", "strength", ["calves"], ["machine"], "Rise onto your toes as high as you can, pause, and lower fully.", []],
  ["ex_plank", "Plank", "core", ["core"], [], "Forearms on the floor, body in a straight line from head to heels. Hold, breathing steadily.", []],
  ["ex_hanging_knee_raise", "Hanging knee raise", "core", ["core"], ["pull-up bar"], "Hang from the bar and raise your knees to your chest without swinging.", ["ex_plank"]],
  ["ex_cable_crunch", "Cable crunch", "core", ["core"], ["cable"], "Kneel facing the cable. Curl your ribs towards your hips, then return.", []],
  ["ex_treadmill", "Treadmill walk or jog", "cardio", ["legs"], ["treadmill"], "Keep a pace where you can speak in short sentences.", ["ex_rower"]],
  ["ex_rower", "Rowing machine", "cardio", ["back", "legs"], ["rower"], "Push with your legs first, then lean back and pull the handle to your ribs. Reverse the order to return.", ["ex_treadmill"]],
  ["ex_cat_cow", "Cat-cow", "mobility", ["back", "core"], [], "On hands and knees, round your back up, then arch it down, moving with your breath.", []],
  ["ex_arm_circles", "Arm circles", "warmup", ["shoulders"], [], "Make slow circles with straight arms, small at first, then bigger. Change direction halfway.", []],
  ["ex_foam_roll", "Foam rolling", "mobility", ["back", "legs"], ["foam roller"], "Roll slowly over each large muscle for 30 seconds, pausing on tender spots.", []],
  ["ex_hip_flexor_stretch", "Hip flexor stretch", "mobility", ["hips"], [], "Kneel on one knee, tuck your pelvis, and shift forward until you feel a stretch at the front of your hip.", []],
  ["ex_chest_stretch", "Doorway chest stretch", "mobility", ["chest", "shoulders"], [], "Forearm on a door frame, step through until you feel a stretch across your chest.", []],
];

export const EXERCISES: Exercise[] = rows.map(([id, name, category, muscleGroups, equipment, instructions, substitutionIds]) => ({
  id, tenantId: null, name, category, muscleGroups, equipment, instructions, substitutionIds, archived: false,
}));
