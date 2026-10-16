/** Optional direct-light visibility only. Manual nearest comparison, or nine comparison taps (PCF). */
export function shadowFragmentSource(
  source: string,
  material: boolean,
): string {
  source = source.replace(
    'out vec4 pixel;',
    `uniform highp sampler2D shadowDepth;
uniform mat4 shadowMatrix;
uniform int shadowLightIndex;
uniform float shadowBias;
uniform float shadowSlopeBias;
uniform float shadowTexel;
uniform bool shadowPcf;
uniform bool receiveShadow;
uniform bool shadowDebug;
out vec4 pixel;
float shadowTap(vec2 uv,vec3 receiver,vec2 depthGradient,float bias){
  if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return 1.0;
  // Compare at the actual nearest texel centre, on the receiver triangle's plane.
  // Reusing the centre fragment depth for neighbouring taps causes striped acne.
  vec2 centre=(floor(uv/shadowTexel)+0.5)*shadowTexel;
  float reference=receiver.z+dot(depthGradient,centre-receiver.xy)-bias;
  return reference<=texture(shadowDepth,uv).r ? 1.0 : 0.0;
}
float shadowVisibility(vec3 n,vec3 l){
  if(shadowLightIndex<0 || !receiveShadow) return 1.0;
  vec4 clip=shadowMatrix*vec4(worldPosition,1.0);
  vec3 p=clip.xyz/clip.w*0.5+0.5;
  vec3 dx=dFdx(p),dy=dFdy(p);
  float determinant=dx.x*dy.y-dx.y*dy.x;
  vec2 depthGradient=abs(determinant)>1e-20
    ? vec2(dy.y*dx.z-dx.y*dy.z,dx.x*dy.z-dy.x*dx.z)/determinant
    : vec2(0.0);
  if(any(lessThan(p,vec3(0.0)))||any(greaterThan(p,vec3(1.0))))return 1.0;
  float bias=shadowBias+shadowSlopeBias*(1.0-max(dot(n,l),0.0));
  if(!shadowPcf)return shadowTap(p.xy,p,depthGradient,bias);
  float visibility=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)visibility+=shadowTap(p.xy+vec2(float(x),float(y))*shadowTexel,p,depthGradient,bias);
  return visibility/9.0;
}`,
  );
  source = source.replace(
    'void main(){',
    `void main(){
  if(shadowDebug){
    float visibility=shadowLightIndex<0 ? 1.0 : shadowVisibility(normalize(worldNormal),lightVectors[shadowLightIndex].xyz);
    pixel=vec4(vec3(visibility),1.0);return;
  }`,
  );
  return material
    ? source.replace(
        'radiance+=energy*(materialResponseEnabled',
        'radiance+=energy*(i==shadowLightIndex ? shadowVisibility(safeUnit(worldNormal),l) : 1.0)*(materialResponseEnabled',
      )
    : source.replace(
        'illumination+=lightColors[i].rgb*lightColors[i].a*diffuse*attenuation;',
        'illumination+=lightColors[i].rgb*lightColors[i].a*diffuse*attenuation*(i==shadowLightIndex ? shadowVisibility(n,source.xyz) : 1.0);',
      );
}
