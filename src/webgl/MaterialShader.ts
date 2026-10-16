import { maxGpuLights } from './LightUniforms.js';
import { litVertexSource, texturedVertexSource } from './LightingShader.js';
/** Direct-light metallic/roughness BRDF. GGX, height-correlated Smith, Schlick.
 * Reference: glTF 2.0 Appendix B. Optional split-sum environment lighting; no multiple scattering.
 */
export function materialVertexSource(
  textures: boolean,
  normalMapping = false,
): string {
  const source = (textures ? texturedVertexSource : litVertexSource)
    .replace(
      'uniform mat4 transform;',
      'layout(location=5) in vec2 materialFactors;\nout vec2 surface;\nuniform mat4 transform;',
    )
    .replace(
      'emissiveColor=emission;',
      'emissiveColor=emission; surface=materialFactors;',
    );
  return normalMapping
    ? source
        .replace(
          'uniform mat4 transform;',
          'layout(location=6) in vec4 tangent;\nout vec4 worldTangent;\nuniform float worldHandedness;\nuniform mat4 transform;',
        )
        .replace(
          'surface=materialFactors;',
          'surface=materialFactors; worldTangent=vec4(mat3(world)*tangent.xyz,tangent.w*worldHandedness);',
        )
    : source;
}
export function materialFragmentSource(
  textures: boolean,
  maps = false,
  normalMapping = false,
  environment = false,
): string {
  return `#version 300 es
precision highp float;
in vec3 linearColor;
in vec3 worldPosition;
in vec3 worldNormal;
in vec3 emissiveColor;
in vec2 surface;
${textures ? 'in vec2 uv; uniform sampler2D baseColorMap;' : ''}
${maps ? 'uniform sampler2D metallicRoughnessMap; uniform sampler2D occlusionMap; uniform float occlusionStrength; uniform int materialDebug;' : ''}
${normalMapping ? 'in vec4 worldTangent; uniform sampler2D normalMap; uniform float normalScale; uniform bool normalMapEnabled; uniform bool normalDebug;' : ''}
${environment ? 'uniform samplerCube environmentSpecular; uniform samplerCube environmentDiffuse; uniform sampler2D environmentBrdf; uniform float environmentIntensity; uniform float environmentRotation; uniform float environmentMaxLod;' : ''}
uniform vec3 cameraPosition;
uniform bool materialResponseEnabled;
uniform bool lightingEnabled;
uniform int lightCount;
uniform vec4 lightVectors[${maxGpuLights}];
uniform vec4 lightColors[${maxGpuLights}];
uniform float lightMinimums[${maxGpuLights}];
out vec4 pixel;
const float PI=3.141592653589793;
vec3 safeUnit(vec3 v){float d=length(v);return d>0.0?v/d:vec3(0.0);}
vec3 response(vec3 base,vec3 n,vec3 v,vec3 l,float metallic,float roughness){
  float nl=max(dot(n,l),0.0), nv=max(dot(n,v),0.0);
  if(nl<=0.0 || nv<=0.0) return vec3(0.0);
  vec3 h=safeUnit(v+l);
  float nh=max(dot(n,h),0.0), vh=max(dot(v,h),0.0);
  float alpha=max(roughness,0.045); alpha*=alpha;
  float a2=alpha*alpha;
  // Stable algebraic form, including near-perfect alignment at minimum roughness.
  float d=(1.0-nh*nh)+nh*nh*a2;
  float distribution=a2/(PI*d*d);
  float visibility=0.5/(nl*sqrt(nv*nv*(1.0-a2)+a2)+nv*sqrt(nl*nl*(1.0-a2)+a2));
  float fresnelWeight=pow(1.0-vh,5.0);
  float dielectricF=0.04+0.96*fresnelWeight;
  vec3 metalF=base+(vec3(1.0)-base)*fresnelWeight;
  vec3 dielectric=(1.0-dielectricF)*base/PI+vec3(dielectricF*distribution*visibility);
  vec3 metal=metalF*distribution*visibility;
  return mix(dielectric,metal,metallic)*nl;
}
void main(){
  vec3 base=linearColor${textures ? '*texture(baseColorMap,uv).rgb' : ''};
  vec3 n=safeUnit(worldNormal), v=safeUnit(cameraPosition-worldPosition);
  ${
    normalMapping
      ? `if(normalMapEnabled){
    vec3 t=safeUnit(worldTangent.xyz-n*dot(n,worldTangent.xyz));
    vec3 b=cross(n,t)*sign(worldTangent.w);
    vec3 sampled=texture(normalMap,uv).rgb*2.0-1.0;
    sampled.xy*=normalScale;
    vec3 mapped=t*sampled.x+b*sampled.y+n*sampled.z;
    if(length(t)>0.0 && length(mapped)>0.0) n=safeUnit(mapped);
  }
  if(normalDebug){pixel=vec4(n*0.5+0.5,1.0);return;}`
      : ''
  }
  ${
    maps
      ? `vec3 packedData=texture(metallicRoughnessMap,uv).rgb;
  float ao=mix(1.0,texture(occlusionMap,uv).r,occlusionStrength);
  float metallic=clamp(surface.x*packedData.b,0.0,1.0), roughness=clamp(surface.y*packedData.g,0.0,1.0);
  if(materialDebug>0){float value=materialDebug==1 ? ao : materialDebug==2 ? roughness : metallic;pixel=vec4(vec3(value),1.0);return;}`
      : `float ao=1.0;
  float metallic=clamp(surface.x,0.0,1.0), roughness=clamp(surface.y,0.0,1.0);`
  }
  vec3 radiance=vec3(0.0);
  for(int i=0;i<${maxGpuLights};i++){
    if(i>=lightCount) break;
    vec4 source=lightVectors[i];
    vec3 energy=lightColors[i].rgb*lightColors[i].a;
    if(source.w==0.0){
      // Explicit diffuse ambient approximation; metals need reflected light, not diffuse fill.
      radiance+=base*energy*(materialResponseEnabled ? (1.0-metallic) : 1.0)*ao;
      continue;
    }
    vec3 l=source.xyz;
    if(source.w==2.0){
      vec3 delta=source.xyz-worldPosition;
      float distance=length(delta), denominator=max(distance,lightMinimums[i]);
      l=safeUnit(delta); energy/=denominator*denominator;
    }
    radiance+=energy*(materialResponseEnabled ? response(base,n,v,l,metallic,roughness) : base*max(dot(n,l),0.0));
  }
  ${
    environment
      ? `if(materialResponseEnabled && environmentIntensity>0.0){
    float nv=max(dot(n,v),0.0), c=cos(environmentRotation), s=sin(environmentRotation);
    mat3 turn=mat3(c,0.0,-s,0.0,1.0,0.0,s,0.0,c);
    vec3 reflection=turn*reflect(-v,n), normal=turn*n;
    vec3 f0=mix(vec3(0.04),base,metallic);
    vec2 brdf=texture(environmentBrdf,vec2(nv,roughness)).rg;
    vec3 specular=textureLod(environmentSpecular,reflection,roughness*environmentMaxLod).rgb*(f0*brdf.x+brdf.y);
    vec3 fresnel=f0+(max(vec3(1.0-roughness),f0)-f0)*pow(1.0-nv,5.0);
    vec3 diffuse=texture(environmentDiffuse,normal).rgb*base*(1.0-metallic)*(vec3(1.0)-fresnel);
    // Existing material AO is an indirect diffuse approximation, not a direct-light/specular shadow.
    radiance+=(diffuse*ao+specular)*environmentIntensity;
  }`
      : ''
  }
  radiance=lightingEnabled ? radiance+emissiveColor : base;
  vec3 c=clamp(radiance,0.0,1.0);
  vec3 srgb=mix(1.055*pow(c,vec3(1.0/2.4))-0.055,12.92*c,lessThanEqual(c,vec3(0.0031308)));
  pixel=vec4(srgb,1.0);
}`;
}
