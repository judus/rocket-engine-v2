"""Add UV-derived vertex tangents to the Hi3D v3 preview (requires NumPy).

Usage: python3 scripts/prepare-hi3d-v3.py source.glb prepared.glb
Preserves existing geometry, indices, material maps and node transforms.
This uses averaged UV derivatives, not MikkTSpace rebaking.
"""
import json
import struct
import sys
from pathlib import Path
import numpy as np

source = Path(sys.argv[1]).read_bytes()
json_size = struct.unpack_from('<I', source, 12)[0]
doc = json.loads(source[20:20 + json_size])
binary = bytearray(source[28 + json_size:])
primitive = doc['meshes'][0]['primitives'][0]
# The original cockpit remains mesh 0; appended coverage meshes are preserved.
assert len(doc['meshes'][0]['primitives']) == 1
assert 'TANGENT' not in primitive['attributes']


def read(index, columns):
    accessor = doc['accessors'][index]
    view = doc['bufferViews'][accessor['bufferView']]
    assert 'sparse' not in accessor
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[accessor['componentType']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    item_size = np.dtype(dtype).itemsize
    return np.ndarray((accessor['count'], columns), dtype=dtype, buffer=binary,
                      offset=offset, strides=(view.get('byteStride', columns * item_size), item_size)).copy()


attrs = primitive['attributes']
pos = read(attrs['POSITION'], 3).astype(np.float64)
normals = read(attrs['NORMAL'], 3).astype(np.float64)
uv = read(attrs['TEXCOORD_0'], 2).astype(np.float64)
triangles = read(primitive['indices'], 1).reshape(-1, 3)
a, b, c = triangles.T
edge1, edge2 = pos[b] - pos[a], pos[c] - pos[a]
duv1, duv2 = uv[b] - uv[a], uv[c] - uv[a]
determinant = duv1[:, 0] * duv2[:, 1] - duv1[:, 1] * duv2[:, 0]
valid = np.abs(determinant) > 1e-12
factor = np.zeros_like(determinant)
factor[valid] = 1 / determinant[valid]
sdir = (edge1 * duv2[:, 1, None] - edge2 * duv1[:, 1, None]) * factor[:, None]
tdir = (edge2 * duv1[:, 0, None] - edge1 * duv2[:, 0, None]) * factor[:, None]
tangent = np.zeros_like(pos)
bitangent = np.zeros_like(pos)
for indices in (a, b, c):
    np.add.at(tangent, indices, sdir)
    np.add.at(bitangent, indices, tdir)
normals /= np.linalg.norm(normals, axis=1)[:, None]
tangent -= normals * np.sum(normals * tangent, axis=1)[:, None]
length = np.linalg.norm(tangent, axis=1)
fallback = length < 1e-12
axis = np.eye(3)[np.argmin(np.abs(normals[fallback]), axis=1)]
tangent[fallback] = np.cross(axis, normals[fallback])
tangent /= np.linalg.norm(tangent, axis=1)[:, None]
sign = np.where(np.sum(np.cross(normals, tangent) * bitangent, axis=1) < 0, -1, 1)
output = np.column_stack((tangent, sign)).astype('<f4')
assert np.isfinite(output).all()
# Drop original BIN padding, then align the appended attribute.
binary = binary[:doc['buffers'][0]['byteLength']]
binary.extend(b'\0' * (-len(binary) % 4))
view_index = len(doc['bufferViews'])
doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary),
                           'byteLength': output.nbytes, 'target': 34962})
binary.extend(output.tobytes())
attrs['TANGENT'] = len(doc['accessors'])
doc['accessors'].append({'bufferView': view_index, 'componentType': 5126,
                         'count': len(output), 'type': 'VEC4'})
doc['buffers'][0]['byteLength'] = len(binary)
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
result = (struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(binary))
          + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
          + struct.pack('<II', len(binary), 0x004e4942) + binary)
Path(sys.argv[2]).write_bytes(result)
print(f'Added {len(output)} tangents; {int(fallback.sum())} degenerate-UV fallbacks; {len(result)} bytes')
