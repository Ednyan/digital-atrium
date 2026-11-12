// Poses for any rigged person: its bones found by their names, whatever the rig,
// and the ready-made poses taken by the Atrium's mannequins (T at rest in their files).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Bone, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { bendFor, facingOf, humanoidOf, partOf, poseHumanoid } from '../src/lib/modelHumanoid.ts'
import { reachTwo } from '../src/lib/modelIk.ts'

test('a bone is known by its name, as the usual rigs name them', () => {
  const cases: Record<string, string | null> = {
    'mixamorig:LeftForeArm': 'LeftForeArm', 'mixamorig:RightUpLeg': 'RightUpLeg', 'mixamorig:Spine2': 'spine', 'mixamorig:HeadTop_End': null, 'mixamorig:LeftHandIndex1': null,
    upperarm_l: 'LeftArm', lowerarm_r: 'RightForeArm', thigh_l: 'LeftUpLeg', calf_r: 'RightLeg', clavicle_l: 'LeftShoulder', pelvis: 'Hips', neck_01: 'Neck', ball_l: null,
    'J_Bip_L_UpperArm': 'LeftArm', 'J_Bip_R_LowerLeg': 'RightLeg', 'J_Bip_C_UpperChest': 'spine', 'J_Sec_Hair1_01': null,
    'upper_arm.L': 'LeftArm', 'forearm.R': 'RightForeArm', 'shin.L': 'LeftLeg', 'Bip01 L Thigh': 'LeftUpLeg', 'CC_Base_L_Upperarm': 'LeftArm',
    LeftArmTwist: null, Hips: 'Hips', Head: 'Head', root: null,
    // A VRoid model's helpers and its clothes' bones: none of them a limb.
    J_Aim_L_UpperLeg: null, J_Roll_R_UpperLeg: null, J_Sec_L_TopsUpperLegBack: null, J_Adj_L_FaceEye: null,
  }
  for (const [name, part] of Object.entries(cases)) assert.equal(partOf(name), part, name)
})

const load = async (path: string): Promise<{ scene: Object3D; bones: Bone[] }> => {
  const data = readFileSync(path)
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.length) as ArrayBuffer, '')
  gltf.scene.updateMatrixWorld(true)
  const bones: Bone[] = []
  gltf.scene.traverse(part => { if ((part as Bone).isBone) bones.push(part as Bone) })
  return { scene: gltf.scene, bones }
}
const at = (bone: Object3D) => bone.getWorldPosition(new Vector3())

for (const kind of ['man', 'woman']) {
  test(`the ${kind} mannequin is found a person, and takes the poses`, async () => {
    const { bones } = await load(`src/assets/models/mannequin-${kind}.glb`)
    const rig = humanoidOf(bones)
    assert.ok(rig, 'a person')
    assert.equal(rig.Hips!.name, 'pelvis')
    assert.equal(rig.Chest!.name, 'spine_03')
    assert.equal(rig.LeftForeArm!.name, 'lowerarm_l')
    assert.ok(facingOf(rig).z > 0.95, 'faces +z')
    const rest = new Map(bones.map(bone => [bone, bone.quaternion.clone()]))
    const restHips = at(rig.Hips!)
    const again = () => { for (const [bone, turn] of rest) bone.quaternion.copy(turn); rig.Hips!.position.copy(rig.Hips!.parent!.worldToLocal(restHips.clone())); rig.Hips!.parent!.updateMatrixWorld(true) }

    // Standing: the arms down from its T, the hands beside the hips; the legs as they were.
    const foot = at(rig.LeftFoot!)
    poseHumanoid(rig, 'stand')
    const shoulder = at(rig.LeftArm!), hand = at(rig.LeftHand!)
    assert.ok(shoulder.y - hand.y > 0.4, `left hand hangs (${shoulder.y.toFixed(2)} -> ${hand.y.toFixed(2)})`)
    assert.ok(Math.abs(hand.x - shoulder.x) < 0.08, 'straight down')
    assert.ok(at(rig.LeftFoot!).distanceTo(foot) < 0.01, 'feet where they were')
    assert.ok(at(rig.RightHand!).x < 0 && at(rig.LeftHand!).x > 0, 'each hand its side')

    // A T: the hands as high as the shoulders, out to the sides.
    again(); poseHumanoid(rig, 'tpose')
    assert.ok(Math.abs(at(rig.LeftHand!).y - at(rig.LeftArm!).y) < 0.05 && at(rig.LeftHand!).x > 0.5, 'left arm out')

    // Sitting: lower, the thighs forward, the shins down.
    again(); poseHumanoid(rig, 'sit')
    const hips = at(rig.Hips!), knee = at(rig.LeftLeg!), ankle = at(rig.LeftFoot!)
    assert.ok(restHips.y - hips.y > 0.3, 'lowered')
    assert.ok(knee.z - hips.z > 0.3 && Math.abs(knee.y - hips.y) < 0.12, 'thigh forward')
    assert.ok(knee.y - ankle.y > 0.3, 'shin down')

    // Waving: the right hand up above the head.
    again(); poseHumanoid(rig, 'wave')
    assert.ok(at(rig.RightHand!).y > at(rig.Head!).y, 'right hand up')
  })
}

test('a knee bends forward and an elbow back, toward its pole, and the foot gets there', async () => {
  const { bones } = await load('src/assets/models/mannequin-man.glb')
  const rig = humanoidOf(bones)!
  poseHumanoid(rig, 'stand')
  assert.ok(bendFor(rig, rig.LeftLeg!)!.z > 0.9)
  assert.ok(bendFor(rig, rig.LeftForeArm!)!.z < -0.9)
  assert.equal(bendFor(rig, rig.Head!), null)
  // The foot drawn up and forward; the knee goes the pole's way.
  const knee = at(rig.LeftLeg!)
  const goal = at(rig.LeftFoot!).add(new Vector3(0, 0.3, 0.1))
  reachTwo(rig.LeftFoot!, goal, knee.clone().add(new Vector3(0, 0, 1)))
  assert.ok(at(rig.LeftFoot!).distanceTo(goal) < 1e-3, 'foot there')
  assert.ok(at(rig.LeftLeg!).z > knee.z + 0.1, 'knee forward')
  // The pole behind: the knee bends backward.
  reachTwo(rig.LeftFoot!, goal, knee.clone().add(new Vector3(0, 0, -1)))
  assert.ok(at(rig.LeftFoot!).distanceTo(goal) < 1e-3, 'foot still there')
  assert.ok(at(rig.LeftLeg!).z < knee.z - 0.1, 'knee back')
})

test('a VRM says which bone is which: its word taken over any name', () => {
  // Named to mislead (helpers first), marked as the VRM reader marks them.
  const make = (name: string, humanBone?: string) => { const bone = new Bone(); bone.name = name; if (humanBone) bone.userData.humanBone = humanBone; return bone }
  const hips = make('A', 'hips'), spine = make('B', 'spine'), chest = make('C', 'chest'), upper = make('D', 'upperChest'), neck = make('E', 'neck'), head = make('F', 'head')
  hips.add(spine); spine.add(chest); chest.add(upper); upper.add(neck); neck.add(head)
  const bones = [hips, spine, chest, upper, neck, head]
  for (const side of ['left', 'right']) {
    const helper = make(`J_Aim_${side}_UpperLeg`)
    const thigh = make('x', `${side}UpperLeg`), shin = make('y', `${side}LowerLeg`), foot = make('z', `${side}Foot`)
    hips.add(helper, thigh); thigh.add(shin); shin.add(foot)
    const arm = make('p', `${side}UpperArm`), fore = make('q', `${side}LowerArm`), hand = make('r', `${side}Hand`)
    upper.add(arm); arm.add(fore); fore.add(hand)
    bones.push(helper, thigh, shin, foot, arm, fore, hand)
  }
  const rig = humanoidOf(bones)
  assert.ok(rig)
  assert.equal(rig.Chest, upper, 'its upper chest')
  assert.equal(rig.LeftUpLeg!.userData.humanBone, 'leftUpperLeg')
  assert.equal(rig.RightForeArm!.userData.humanBone, 'rightLowerArm')
})
