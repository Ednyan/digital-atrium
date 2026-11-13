// Builds the poses and animations a person's skeleton is given (src/lib/motions,
// lib/modelHumanoid) into src/assets/motions, from sources kept outside the repo:
//
//   node scripts/build-motions.mjs <UAL1_Standard.glb> <UAL2_Standard.glb> <folder of CMU .bvh>
//
// - Quaternius's Universal Animation Library 1 and 2 [Standard] (CC0), their
//   Unreal-Godot .glb: every animation, 30 frames a second.
// - CMU's motion capture database (mocap.cs.cmu.edu), as BVH (github.com/sfd158/cmu-mocap):
//   the recordings named in CMU below, 24 frames a second, the calibration at
//   their start left out. Their hands are one bone: given a relaxed hand instead.
// - POSES: single frames chosen from them, by contact sheets.
//
// Each is read as frames (readFrame) and kept small (storeMotion).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { AnimationMixer, Group, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js'
import { BODY, humanoidOf, readFrame, restOf } from '../src/lib/modelHumanoid.ts'
import { frameAt, readMotion, storeMotion } from '../src/lib/motions.ts'

const [ual1, ual2, cmuFolder] = process.argv.slice(2)
if (!ual1 || !ual2 || !cmuFolder) throw new Error('usage: node scripts/build-motions.mjs <UAL1_Standard.glb> <UAL2_Standard.glb> <CMU bvh folder>')
const OUT = 'src/assets/motions/'
mkdirSync(OUT, { recursive: true })

// [file, name, group, from (s), to (s)]
const CMU = [
  ['137_21', 'Graceful lady, a cup', 'expressive'], ['137_23', 'Graceful lady waiting', 'expressive'], ['137_24', 'Graceful lady walking', 'expressive'],
  ['137_35', 'Sexy lady, a cup', 'expressive'], ['137_36', 'Sexy lady picking up', 'expressive'], ['137_37', 'Sexy lady waiting', 'expressive'], ['137_38', 'Sexy lady walking', 'expressive'],
  ['137_28', 'Waiting', 'expressive'], ['142_04', 'Cool walk', 'expressive'], ['142_06', 'Elated walk', 'expressive'], ['142_10', 'Lavish walk', 'expressive'],
  ['142_13', 'Relaxed walk', 'expressive'], ['142_18', 'Sexy walk', 'expressive'], ['142_19', 'Shy walk', 'expressive'], ['91_30', 'Sexy walk 2', 'expressive'],
  ['105_30', 'Sexy walk 3', 'expressive'], ['82_09', 'Confident walk', 'expressive'], ['79_94', 'Flexing', 'expressive'], ['79_69', 'Very happy', 'expressive'], ['79_71', 'Sad', 'expressive'],
  ['05_02', 'Modern dance, expressive arms', 'dance'], ['05_12', 'Modern dance, arms high', 'dance'], ['05_18', 'Modern dance, arabesque', 'dance'],
  ['49_09', 'Dance, arms high', 'dance'], ['49_12', 'Dance, arching arms', 'dance'], ['49_15', 'Dance pose, folded in', 'dance'], ['49_18', 'Balance on one leg', 'dance'],
  ['49_22', 'Dance, leaning back', 'dance'], ['55_02', 'Lambada', 'dance'], ['60_01', 'Salsa', 'dance'], ['61_01', 'Salsa 2', 'dance'], ['93_03', 'Charleston', 'dance'],
  ['93_04', 'Charleston (female)', 'dance'], ['93_08', 'Fancy Charleston', 'dance'], ['90_28', 'Breakdance', 'dance'], ['120_05', 'Cartoon dance', 'dance'], ['143_35', 'Macarena', 'dance'],
  ['13_17', 'Boxing', 'action'], ['14_01', 'Boxing 2', 'action'], ['76_04', 'Guard', 'action'], ['135_01', 'Karate kata', 'action'], ['135_04', 'Front kick', 'action'],
  ['135_07', 'Roundhouse kick', 'action'], ['135_09', 'Lunge punch', 'action'], ['135_11', 'Side kick', 'action'], ['144_20', 'Punch sequence', 'action'], ['144_26', 'Blocks', 'action'],
  ['144_05', 'Front kicks', 'action'], ['144_11', 'Lunges', 'action'], ['86_01', 'Jumps, kicks and punches', 'action'], ['88_06', 'Jump spin kick', 'action'], ['74_03', 'Kick', 'action'],
  ['02_07', 'Swordplay', 'action'],
  ['75_17', 'Sitting', 'everyday'], ['75_20', 'Sitting low', 'everyday'], ['143_18', 'Sit down and get up', 'everyday'], ['143_25', 'Waving', 'everyday'],
  ['143_30', 'Stretch and yawn', 'everyday'], ['144_30', 'Sun salutation', 'everyday'],
]
// [name, group, motion id, seconds in] -- chosen from contact sheets of every
// motion's frames on the woman mannequin (scratch work, not kept).
const POSES = [
  ['Idle', 'standard', 'ual1-Idle_Loop', 1.9], ['Talking', 'standard', 'ual1-Idle_Talking_Loop', 0.74], ['Arms folded', 'standard', 'ual2-Idle_FoldArms_Loop', 0.63],
  ['On the phone', 'standard', 'ual2-Idle_TalkingPhone_Loop', 0.73], ['Sitting', 'standard', 'ual1-Sitting_Idle_Loop', 0.43], ['Sitting, talking', 'standard', 'ual1-Sitting_Talking_Loop', 0.74],
  ['Kneeling', 'standard', 'ual1-Fixing_Kneeling', 0.87], ['Crouching', 'standard', 'ual1-Crouch_Idle_Loop', 0.74], ['Walking', 'standard', 'ual1-Walk_Loop', 0.34],
  ['Running', 'standard', 'ual1-Sprint_Loop', 0.18], ['Waving', 'standard', 'cmu-143_25', 1.13], ['Stretching', 'standard', 'cmu-143_30', 1.36],
  ['Reclining', 'standard', 'ual2-LayToIdle', 0.26], ['Yoga, arms up', 'standard', 'cmu-144_30', 1], ['Yoga, arms open', 'standard', 'cmu-144_30', 5.02], ['Forward bend', 'standard', 'cmu-144_30', 7.02],
  ['Hand on hip', 'expressive', 'cmu-137_37', 3.01], ['Hands on hips', 'expressive', 'cmu-137_37', 7.02], ['Weight on one leg', 'expressive', 'cmu-137_37', 9.03],
  ['Sipping', 'expressive', 'cmu-137_35', 7.02], ['Bending over', 'expressive', 'cmu-137_36', 9.03], ['Strutting', 'expressive', 'cmu-137_38', 7.02],
  ['Catwalk', 'expressive', 'cmu-91_30', 5.02], ['Graceful', 'expressive', 'cmu-137_23', 7.02], ['Shy', 'expressive', 'cmu-142_19', 3.01],
  ['Celebrating', 'expressive', 'cmu-79_69', 0.49], ['Cheering', 'expressive', 'cmu-79_69', 2.43], ['Sad', 'expressive', 'cmu-79_71', 0.67],
  ['Hand in hair', 'expressive', 'cmu-55_02', 1], ['Hands behind head', 'expressive', 'cmu-143_35', 2.42], ['Knee up, hand behind head', 'expressive', 'cmu-49_22', 2.44],
  ['Balancing', 'expressive', 'cmu-49_18', 3.42], ['Leap', 'expressive', 'cmu-05_12', 9.43], ['Arabesque', 'expressive', 'cmu-05_18', 11.04], ['Dancing', 'expressive', 'ual1-Dance_Loop', 0.26],
  ['Superhero landing', 'action', 'ual1-Jump_Land', 0.22], ['Mid-air', 'action', 'ual1-Jump_Loop', 0.63], ['Aiming', 'action', 'ual1-Pistol_Aim_Neutral', 0.03],
  ['Pistol up', 'action', 'ual1-Pistol_Aim_Up', 0.03], ['Hook', 'action', 'ual2-Melee_Hook', 0.25], ['Fists up', 'action', 'ual1-Punch_Jab', 0.75],
  ['Casting a spell', 'action', 'ual1-Spell_Simple_Shoot', 0.09], ['Sword ready', 'action', 'ual1-Sword_Idle', 0.28], ['Sword lunge', 'action', 'ual1-Sword_Attack', 0.78],
  ['Blocking', 'action', 'ual2-Sword_Block', 0.21], ['Heavy swing', 'action', 'ual2-Sword_Heavy_Combo', 0.73], ['Low strike', 'action', 'ual2-Sword_Regular_B', 0.28],
  ['Ninja crouch', 'action', 'ual2-NinjaJump_Idle_Loop', 0.51], ['Ninja jump', 'action', 'ual2-NinjaJump_Start', 0.17], ['Throwing', 'action', 'ual2-OverhandThrow', 0.23],
  ['Knocked back', 'action', 'ual2-Hit_Knockback', 0.14], ['Sliding', 'action', 'ual2-Slide_Loop', 0.51], ['Boxing', 'action', 'cmu-13_17', 1],
  ['Guard', 'action', 'cmu-76_04', 0.22], ['Karate stance', 'action', 'cmu-135_04', 0.83], ['High kick', 'action', 'cmu-135_07', 2.82], ['Punch', 'action', 'cmu-144_20', 7.02], ['High block', 'action', 'cmu-144_26', 5.02],
]

const pretty = name => name.replace(/_Loop$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())
const groupOf = name => /Dance/.test(name) ? 'dance'
  : /Sword|Punch|Melee|Pistol|Shield|Spell|Hit|Death|Roll|Ninja|Slide|Throw|Zombie|Knockback/.test(name) ? 'action' : 'everyday'

// Every bone of a scene, and how each stands at rest, to start each clip from.
function bonesAtRest(scene) {
  const bones = []
  scene.traverse(part => { if (part.isBone) bones.push(part) })
  const rest = bones.map(bone => [bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()])
  return { bones, toRest: () => bones.forEach((bone, i) => { bone.position.copy(rest[i][0]); bone.quaternion.copy(rest[i][1]); bone.scale.copy(rest[i][2]) }) }
}

// A clip's frames, `fps` a second from `from` to `to`.
function sample(scene, clip, rig, rest, toRest, fps, from = 0, to = clip.duration) {
  const mixer = new AnimationMixer(scene)
  const action = mixer.clipAction(clip)
  action.play()
  const frames = []
  // At rest once, before it: the mixer writes only what changes from one time to
  // the next, so a part it holds still would be left at rest after the first.
  toRest()
  for (let t = from; t <= to + 1e-6; t += 1 / fps) {
    mixer.setTime(t)
    scene.updateMatrixWorld(true)
    frames.push(readFrame(rig, rest))
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(scene)
  toRest()
  return frames
}

// Facing forward as it starts: its heading then (the hips' turn about up) taken
// from every frame, and the hips' shift turned with it. A recording faces
// wherever its performer faced in the room.
function faceForward(frames) {
  const ahead = new Vector3(0, 0, 1).applyQuaternion(frames[0].own.Hips ?? new Quaternion())
  const back = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(ahead.x, ahead.z))
  for (const frame of frames) {
    frame.own.Hips = back.clone().multiply(frame.own.Hips ?? new Quaternion())
    frame.hips.applyQuaternion(back)
  }
  return frames
}

async function quaternius(path, tag) {
  const data = readFileSync(path)
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.length), '')
  gltf.scene.updateMatrixWorld(true)
  const { bones, toRest } = bonesAtRest(gltf.scene)
  const rig = humanoidOf(bones)
  const rest = restOf(rig)
  return gltf.animations.filter(clip => clip.name !== 'A_TPose').map(clip => storeMotion(
    { id: `${tag}-${clip.name}`, name: pretty(clip.name), group: groupOf(clip.name), fps: 30, loop: /Loop/.test(clip.name) },
    rest.aims,
    faceForward(sample(gltf.scene, clip, rig, rest, toRest, 30)),
  ))
}

const FINGER_PARTS = BODY.filter(part => /(Thumb|Index|Middle|Ring|Little)\d$/.test(part))
function cmu(relaxed) {
  return CMU.map(([file, name, group, from = 1, to = 13]) => {
    const { skeleton, clip } = new BVHLoader().parse(readFileSync(join(cmuFolder, `${file}.bvh`), 'utf8'))
    const scene = new Group()
    scene.add(skeleton.bones[0])
    scene.updateMatrixWorld(true)
    const { bones, toRest } = bonesAtRest(scene)
    const rig = humanoidOf(bones)
    // Its "fingers" are one bone: none of them read.
    for (const part of FINGER_PARTS) delete rig[part]
    const rest = restOf(rig)
    const start = Math.min(from, clip.duration / 4), end = Math.min(to, clip.duration)
    const frames = faceForward(sample(scene, clip, rig, rest, toRest, 24, start, end))
    // A relaxed hand, from a Quaternius idle.
    for (const frame of frames) for (const part of FINGER_PARTS) if (relaxed[part]) frame.own[part] = relaxed[part].clone()
    return storeMotion({ id: `cmu-${file}`, name, group, fps: 24, loop: false }, rest.aims, frames)
  })
}

const write = (file, source, clips) => {
  writeFileSync(OUT + file, JSON.stringify({ source, clips }))
  console.log(file, clips.length, 'clips', (JSON.stringify({ clips }).length / 1e6).toFixed(2), 'MB')
}

const library = [...await quaternius(ual1, 'ual1'), ...await quaternius(ual2, 'ual2')]
write('quaternius.json', 'Quaternius, Universal Animation Library 1 and 2 [Standard] (CC0)', library)
const idle = readMotion(library.find(clip => clip.id === 'ual1-Idle_Loop'))
const relaxed = frameAt(idle, 0).own
const mocap = cmu(relaxed)
write('cmu.json', 'Carnegie Mellon University motion capture database (mocap.cs.cmu.edu)', mocap)

// The poses: frames from either, kept alone.
const every = new Map([...library, ...mocap].map(clip => [clip.id, clip]))
const poses = POSES.map(([name, group, id, seconds], i) => {
  const motion = readMotion(every.get(id) ?? (() => { throw new Error(`no motion ${id}`) })())
  return storeMotion({ id: `pose-${i}-${basename(id)}`, name, group, fps: 1, loop: false }, motion.aims, faceForward([frameAt(motion, seconds)]))
})
write('poses.json', 'Frames of the Quaternius animations and CMU recordings', poses)

// What's there to play, without fetching it all: each animation's name, group, file and length.
const index = [['quaternius', library], ['cmu', mocap]].flatMap(([file, clips]) => clips.map(({ id, name, group, frames, fps, loop }) => ({ id, name, group, file, seconds: Math.round((frames / fps) * 10) / 10, loop })))
writeFileSync(OUT + 'index.json', JSON.stringify(index))
console.log('index.json', index.length, 'animations')
