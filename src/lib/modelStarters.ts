// Models to start from: four shapes, made here, and two mannequins -- a man and a
// woman by Quaternius (CC0: anyone's, to use and pass on), rigged, so they pose as
// any rigged model does, and take the ready-made poses (lib/modelHumanoid).
// Each is a .glb (lib/model3d), placed as any model is.

import type { Bone, Object3D } from 'three'

export const STARTERS = ['cube', 'sphere', 'cylinder', 'cone', 'man', 'woman'] as const
export type Starter = typeof STARTERS[number]

/** A model to start from, as a .glb file. */
export async function starterFile(kind: Starter, name: string): Promise<File> {
  const { asOneFile } = await import('./model3d')
  const object = kind === 'man' || kind === 'woman' ? await mannequin(kind) : await shape(kind)
  return new File([await asOneFile(object)], `${name}.glb`, { type: 'model/gltf-binary' })
}

async function shape(kind: Exclude<Starter, 'man' | 'woman'>): Promise<Object3D> {
  const { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } = await import('three')
  const geometry = kind === 'sphere' ? new SphereGeometry(0.5, 48, 32)
    : kind === 'cylinder' ? new CylinderGeometry(0.5, 0.5, 1, 48)
    : kind === 'cone' ? new ConeGeometry(0.5, 1, 48)
    : new BoxGeometry(1, 1, 1)
  const group = new Group()
  group.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.55, metalness: 0.05 })))
  return group
}

// Its file rests in a T; it's first seen standing, arms down -- kept so, its rest
// from then on (Reset pose), with the T one of its poses.
async function mannequin(kind: 'man' | 'woman'): Promise<Object3D> {
  const [{ default: url }, { parseModel }, { humanoidOf, poseHumanoid }] = await Promise.all([
    kind === 'man' ? import('../assets/models/mannequin-man.glb?url') : import('../assets/models/mannequin-woman.glb?url'),
    import('./model3d'),
    import('./modelHumanoid'),
  ])
  const answer = await fetch(url)
  if (!answer.ok) throw new Error(`the mannequin could not be fetched (${answer.status})`)
  const object = await parseModel(await answer.arrayBuffer(), 'glb')
  object.updateMatrixWorld(true)
  const bones: Bone[] = []
  object.traverse(part => { if ((part as Bone).isBone) bones.push(part as Bone) })
  const rig = humanoidOf(bones)
  if (rig) poseHumanoid(rig, 'stand')
  return object
}
