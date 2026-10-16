export const litVertexSource = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec3 color;
layout(location=2) in vec3 normal;
layout(location=3) in vec3 emission;
uniform mat4 transform;
uniform mat4 world;
uniform mat3 normalTransform;
out vec3 linearColor;
out vec3 worldPosition;
out vec3 worldNormal;
out vec3 emissiveColor;
void main(){
  gl_Position=transform*vec4(position,1.0);
  worldPosition=(world*vec4(position,1.0)).xyz;
  worldNormal=normalTransform*normal;
  linearColor=color;
  emissiveColor=emission;
}`;
export const litFragmentSource = `#version 300 es
precision highp float;
in vec3 linearColor;
in vec3 worldPosition;
in vec3 worldNormal;
in vec3 emissiveColor;
uniform bool lightingEnabled;
uniform int lightCount;
uniform vec4 lightVectors[8];
uniform vec4 lightColors[8];
uniform float lightMinimums[8];
out vec4 pixel;
void main(){
  vec3 illumination=vec3(0.0);
  float normalLength=length(worldNormal);
  vec3 n=normalLength>0.0 ? worldNormal/normalLength : vec3(0.0);
  for(int i=0;i<8;i++){
    if(i>=lightCount) break;
    vec4 source=lightVectors[i];
    float diffuse=1.0;
    float attenuation=1.0;
    if(source.w==1.0){
      diffuse=max(0.0,dot(n,source.xyz));
    } else if(source.w==2.0){
      vec3 delta=source.xyz-worldPosition;
      float distance=length(delta);
      diffuse=distance>0.0 ? max(0.0,dot(n,delta/distance)) : 0.0;
      float denominator=max(distance,lightMinimums[i]);
      attenuation=1.0/(denominator*denominator);
    }
    illumination+=lightColors[i].rgb*lightColors[i].a*diffuse*attenuation;
  }
  vec3 radiance=lightingEnabled ? linearColor*illumination+emissiveColor : linearColor;
  vec3 c=clamp(radiance,0.0,1.0);
  vec3 srgb=mix(1.055*pow(c,vec3(1.0/2.4))-0.055,12.92*c,lessThanEqual(c,vec3(0.0031308)));
  pixel=vec4(srgb,1.0);
}`;

/** Same lighting equation with hardware sRGB decode and perspective-correct UV interpolation. */
export const texturedVertexSource = litVertexSource
  .replace(
    'uniform mat4 transform;',
    'layout(location=4) in vec2 texCoord;\nout vec2 uv;\nuniform mat4 transform;',
  )
  .replace('emissiveColor=emission;', 'emissiveColor=emission; uv=texCoord;');
export const texturedFragmentSource = litFragmentSource
  .replace(
    'in vec3 linearColor;',
    'in vec2 uv;\nuniform sampler2D baseColorMap;\nin vec3 linearColor;',
  )
  .replace(
    'vec3 radiance=lightingEnabled ? linearColor*illumination+emissiveColor : linearColor;',
    'vec3 base=linearColor*texture(baseColorMap,uv).rgb;\n  vec3 radiance=lightingEnabled ? base*illumination+emissiveColor : base;',
  );
