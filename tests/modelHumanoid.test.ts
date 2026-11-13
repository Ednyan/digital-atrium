// Poses and animations for any rigged person: its bones found by their names,
// whatever the rig, fingers too; a frame read from one skeleton and given to
// another; the motions library played on the Atrium's mannequins.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AnimationMixer, Bone, Vector3, type AnimationClip, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { applyFrame, basicPose, bendFor, facingOf, fingerOf, humanoidOf, partOf, readFrame, restOf, type Humanoid } from '../src/lib/modelHumanoid.ts'
import { frameAt, readMotion, type StoredMotion } from '../src/lib/motions.ts'
import { reachTwo } from '../src/lib/modelIk.ts'

test('a bone is known by its name, as the usual rigs name them', () => {
  const cases: Record<string, string | null> = {
    'mixamorig:LeftForeArm': 'LeftForeArm', 'mixamorig:RightUpLeg': 'RightUpLeg', 'mixamorig:Spine2': 'spine', 'mixamorig:HeadTop_End': null, 'mixamorig:LeftHandIndex1': null,
    upperarm_l: 'LeftArm', lowerarm_r: 'RightForeArm', thigh_l: 'LeftUpLeg', calf_r: 'RightLeg', clavicle_l: 'LeftShoulder', pelvis: 'Hips', neck_01: 'Neck', ball_l: null,
    'J_Bip_L_UpperArm': 'LeftArm', 'J_Bip_R_LowerLeg': 'RightLeg', 'J_Bip_C_UpperChest': 'spine', 'J_Sec_Hair1_01': null,
    'upper_arm.L': 'LeftArm', 'forearm.R': 'RightForeArm', 'shin.L': 'LeftLeg', 'Bip01 L Thigh': 'LeftUpLeg', 'CC_Base_L_Upperarm': 'LeftArm',
    LeftArmTwist: null, Hips: 'Hips', Head: 'Head', root: null, LHipJoint: null,
    // A VRoid model's helpers and its clothes' bones: none of them a limb.
    J_Aim_L_UpperLeg: null, J_Roll_R_UpperLeg: null, J_Sec_L_TopsUpperLegBack: null, J_Adj_L_FaceEye: null,
  }
  for (const [name, part] of Object.entries(cases)) assert.equal(partOf(name), part, name)
  const fingers: Record<string, string | null> = { 'mixamorig:LeftHandIndex1': 'Index', index_02_l: 'Index', thumb_01_r: 'Thumb', pinky_03_l: 'Little', J_Bip_L_Ring2: 'Ring', 'f_middle.01.L': 'Middle', index_04_leaf_l: null, index_metacarpal_l: null }
  for (const [name, finger] of Object.entries(fingers)) assert.equal(fingerOf(name), finger, name)
})

const load = async (path: string) => {
  const data = readFileSync(path)
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.length) as ArrayBuffer, '')
  gltf.scene.updateMatrixWorld(true)
  const bones: Bone[] = []
  gltf.scene.traverse(part => { if ((part as Bone).isBone) bones.push(part as Bone) })
  const kept = bones.map(bone => [bone.position.clone(), bone.quaternion.clone()] as const)
  const toRest = () => { bones.forEach((bone, i) => { bone.position.copy(kept[i][0]); bone.quaternion.copy(kept[i][1]) }); gltf.scene.updateMatrixWorld(true) }
  return { scene: gltf.scene, bones, toRest, clips: gltf.animations as AnimationClip[] }
}
const at = (bone: Object3D) => bone.getWorldPosition(new Vector3())
const library = (name: string) => (JSON.parse(readFileSync(`src/assets/motions/${name}.json`, 'utf8')).clips as StoredMotion[])
const motion = (name: string, id: string) => readMotion(library(name).find(clip => clip.id === id)!)

for (const kind of ['man', 'woman']) {
  test(`the ${kind} mannequin is found a person, fingers and all, and stands`, async () => {
    const { bones, toRest } = await load(`src/assets/models/mannequin-${kind}.glb`)
    const rig = humanoidOf(bones)!
    assert.ok(rig, 'a person')
    assert.equal(rig.Hips!.name, 'pelvis')
    assert.equal(rig.Chest!.name, 'spine_03')
    assert.equal(rig.LeftIndex1!.name, 'index_01_l')
    assert.equal(rig.RightThumb3!.name, 'thumb_03_r')
    assert.ok(facingOf(rig).z > 0.95, 'faces +z')
    const rest = restOf(rig)
    const { frame, aims } = basicPose('stand')
    const foot = at(rig.LeftFoot!)
    applyFrame(rig, rest, frame, aims)
    const shoulder = at(rig.LeftArm!), hand = at(rig.LeftHand!)
    assert.ok(shoulder.y - hand.y > 0.4 && Math.abs(hand.x - shoulder.x) < 0.08, 'left arm hangs from its T')
    assert.ok(at(rig.LeftFoot!).distanceTo(foot) < 0.01, 'feet where they were')
    toRest()
    const t = basicPose('tpose')
    applyFrame(rig, rest, t.frame, t.aims)
    assert.ok(Math.abs(at(rig.LeftHand!).y - at(rig.LeftArm!).y) < 0.05 && at(rig.LeftHand!).x > 0.5, 'a T')
  })
}

test('a frame read from a skeleton and given back to it puts every joint where it was', async () => {
  const { scene, bones, toRest, clips } = await load('C:/Users/Ednyan/Desktop/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb').catch(() => ({ clips: [] as AnimationClip[] } as never))
  if (!clips.length) return // the library lives outside the repo
  const rig = humanoidOf(bones)!
  const rest = restOf(rig)
  for (const name of ['Punch_Cross', 'Sitting_Idle_Loop', 'Sword_Attack']) {
    const mixer = new AnimationMixer(scene)
    mixer.clipAction(clips.find(clip => clip.name === name)!).play()
    mixer.setTime(0.4)
    scene.updateMatrixWorld(true)
    // Its shape -- each joint from the hips -- and the hips' height.
    const shape = () => new Map(Object.entries(rig).map(([part, bone]) => [part, at(bone!).sub(at(rig.Hips!))]))
    const wanted = shape(), height = at(rig.Hips!).y
    const frame = readFrame(rig, rest)
    mixer.stopAllAction()
    toRest()
    applyFrame(rig, rest, frame, rest.aims)
    const got = shape()
    for (const [part, place] of got) assert.ok(place.distanceTo(wanted.get(part)!) < 0.01, `${name}: ${part} off by ${place.distanceTo(wanted.get(part)!).toFixed(3)}`)
    assert.ok(Math.abs(at(rig.Hips!).y - height) < 0.02, `${name}: hips at ${at(rig.Hips!).y.toFixed(3)}, not ${height.toFixed(3)}`)
  }
})

test('the library plays on another body: sitting sinks it, a punch reaches out with a fist', async () => {
  const { bones, toRest } = await load('src/assets/models/mannequin-woman.glb')
  const rig: Humanoid = humanoidOf(bones)!
  const rest = restOf(rig)
  const hips = at(rig.Hips!)
  const sit = motion('quaternius', 'ual1-Sitting_Idle_Loop')
  applyFrame(rig, rest, frameAt(sit, 0.5), sit.aims)
  assert.ok(hips.y - at(rig.Hips!).y > 0.3, 'sunk')
  assert.ok(at(rig.LeftLeg!).z - at(rig.Hips!).z > 0.25, 'thighs forward')
  toRest()
  const punch = motion('quaternius', 'ual1-Punch_Cross')
  applyFrame(rig, rest, frameAt(punch, 0.35), punch.aims)
  const reach = Math.max(at(rig.LeftHand!).z, at(rig.RightHand!).z) - at(rig.Chest!).z
  assert.ok(reach > 0.35, `a hand out in front (${reach.toFixed(2)})`)
  // A fist: the index finger's tip curled well in from where it was, straight out.
  const tipFrom = () => at(rig.RightIndex3!).distanceTo(at(rig.RightHand!))
  const curled = tipFrom()
  toRest()
  assert.ok(curled < tipFrom() * 0.7, `right fist (${curled.toFixed(3)} from ${tipFrom().toFixed(3)})`)
  // A mocap recording, its hands relaxed.
  toRest()
  const salsa = motion('cmu', 'cmu-60_01')
  for (const seconds of [0, 2, 5]) { toRest(); applyFrame(rig, rest, frameAt(salsa, seconds), salsa.aims) }
  assert.ok(Number.isFinite(at(rig.Head!).y) && at(rig.Head!).y > 1.2, 'still standing, dancing')
})

test('a knee bends forward and an elbow back, toward its pole, and the foot gets there', async () => {
  const { bones } = await load('src/assets/models/mannequin-man.glb')
  const rig = humanoidOf(bones)!
  const { frame, aims } = basicPose('stand')
  applyFrame(rig, restOf(rig), frame, aims)
  assert.ok(bendFor(rig, rig.LeftLeg!)!.z > 0.9)
  assert.ok(bendFor(rig, rig.LeftForeArm!)!.z < -0.9)
  assert.equal(bendFor(rig, rig.Head!), null)
  const knee = at(rig.LeftLeg!)
  const goal = at(rig.LeftFoot!).add(new Vector3(0, 0.3, 0.1))
  reachTwo(rig.LeftFoot!, goal, knee.clone().add(new Vector3(0, 0, 1)))
  assert.ok(at(rig.LeftFoot!).distanceTo(goal) < 1e-3, 'foot there')
  assert.ok(at(rig.LeftLeg!).z > knee.z + 0.1, 'knee forward')
  reachTwo(rig.LeftFoot!, goal, knee.clone().add(new Vector3(0, 0, -1)))
  assert.ok(at(rig.LeftLeg!).distanceTo(knee) > 0.1 && at(rig.LeftLeg!).z < knee.z - 0.1, 'knee back')
})

test('a VRM says which bone is which: its word taken over any name', () => {
  const make = (name: string, humanBone?: string) => { const bone = new Bone(); bone.name = name; if (humanBone) bone.userData.humanBone = humanBone; return bone }
  const hips = make('A', 'hips'), spine = make('B', 'spine'), chest = make('C', 'chest'), upper = make('D', 'upperChest'), neck = make('E', 'neck'), head = make('F', 'head')
  hips.add(spine); spine.add(chest); chest.add(upper); upper.add(neck); neck.add(head)
  const bones = [hips, spine, chest, upper, neck, head]
  for (const side of ['left', 'right']) {
    const helper = make(`J_Aim_${side}_UpperLeg`)
    const thigh = make('x', `${side}UpperLeg`), shin = make('y', `${side}LowerLeg`), foot = make('z', `${side}Foot`)
    hips.add(helper, thigh); thigh.add(shin); shin.add(foot)
    const arm = make('p', `${side}UpperArm`), fore = make('q', `${side}LowerArm`), hand = make('r', `${side}Hand`), index = make('s', `${side}IndexProximal`)
    upper.add(arm); arm.add(fore); fore.add(hand); hand.add(index)
    bones.push(helper, thigh, shin, foot, arm, fore, hand, index)
  }
  const rig = humanoidOf(bones)
  assert.ok(rig)
  assert.equal(rig.Chest, upper, 'its upper chest')
  assert.equal(rig.LeftUpLeg!.userData.humanBone, 'leftUpperLeg')
  assert.equal(rig.RightForeArm!.userData.humanBone, 'rightLowerArm')
  assert.equal(rig.LeftIndex1!.userData.humanBone, 'leftIndexProximal')
})
