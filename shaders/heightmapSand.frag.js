export default `
#include <common>

#define M_PI 3.1415926535897932384626433832795

uniform float uMasterScale;
uniform float uBackgroundWaveScale;
uniform vec2 uMousePos;
uniform vec3 uCircularWave[ 3 ];
uniform vec2 uCircularWaveRadius[ 3 ];
uniform float uGridUnit;
uniform float uWaveStart;
uniform mat2 uWaveTransform;
uniform float uTime;

// mat2 uWaveTransform = mat2(0.8, 0.6, -0.6, 0.8);

#define deltaTime ( 1.0 / 60.0 )
#define GRAVITY_CONSTANT ( resolution.x * deltaTime * 3.0 )


vec2 random2(vec2 st){
  st = vec2( dot(st,vec2(127.1,311.7)),
            dot(st,vec2(269.5,183.3)) );
  return -1.0 + 2.0*fract(sin(st)*4375.5453123);
}

// Gradient Noise by Inigo Quilez - iq/2013
// https://www.shadertoy.com/view/XdXGW8
float cnoise2(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);

  vec2 u = f*f*(3.0-2.0*f);

  return mix( mix( dot( random2(i + vec2(0.0,0.0) ), f - vec2(0.0,0.0) ),
                   dot( random2(i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
              mix( dot( random2(i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ),
                   dot( random2(i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
}

float atan2(float y, float x) {
  if (x > 0.0) {
    return atan(y / x);
  } else if (x < 0.0) {
    if (y >= 0.0) {
      return (atan(y / x) + M_PI);
    } else {
      return (atan(y / x) - M_PI);
    }
  } else if (x == 0.0) {
    if (y < 0.0) {
      return M_PI * -0.5;
    } else {
      // (x, y) = (0, 0) goes here
      return M_PI * 0.5;
    }
  }
}

float localScale = 10.;

void main()	{

  vec2 cellSize = 1.0 / resolution.xy;

  vec2 uv = gl_FragCoord.xy * cellSize;
  vec2 uvNew = uWaveTransform * uv;

  // vec4 heightmapValue = texture2D( heightmap, uv );
  vec4 heightmapValue = vec4(0.);


  // Background Waves

  // 1. Basics
  heightmapValue.x = pow(sin(uv.x * 200.0), 0.5) * 10.0 * uBackgroundWaveScale;

  // 2. Advanced
  float angle = uvNew.x * 200.0;
  float wave = sin(uvNew.y * 10.0) * 8.0;
  float sum = angle + wave;
  if (sum > -20.0 * M_PI && sum < 10.0 * M_PI) {
    heightmapValue.x = pow(sin(sum), 0.5) * 10.0 * uBackgroundWaveScale;
  } else {
    heightmapValue.x = pow(sin(uv.x * 200.0), 0.5) * 10.0 * uBackgroundWaveScale;
  }


  // Grid
  // if (uGridUnit >= 2.0) {
  //   // Basic Waves
  //   heightmapValue.x = pow(sin(uv.x * 200.0), 0.5) * localScale * uBackgroundWaveScale;

  //   float unit = 1.0 / floor(uGridUnit);
  //   float gridX = mod(uv.x / unit, 2.0);
  //   float gridY = mod(uv.y / unit, 2.0);
  //   if ((gridX < 1.0 && gridY < 1.0) || (gridX >= 1.0 && gridY >= 1.0)) {
  //     heightmapValue.x = pow(sin(uv.y * 200.0), 0.5) * localScale * uBackgroundWaveScale;
  //   }
  // } else {

  //   // original
  //   float angle = uvNew.x * 200.0;
  //   float wave = sin(uvNew.y * 10.0) * 8.0;

  //   // Cool Shit
  //   // float angle = uv.x * uv.y * 200.0;
  //   // float wave = sin(uvNew.y * 10.0 + sin(uvNew.x * 10.0) * 0.8) * 8.0;
  //   // float wave = sin(uvNew.y * 10.0 + sin(uvNew.y * 10.0)) * 8.0;
  //   // float wave = sin(uvNew.y * 10.0 + sin(uv.y * 10.0) * 2.0) * 8.0;

  //   float sum = angle + wave;
  //   if (sum > uWaveStart * M_PI && sum < (uWaveStart + 30.0) * M_PI) {
  //     heightmapValue.x = pow(sin(sum), 0.5) * localScale * uBackgroundWaveScale;
  //   } else {
  //     heightmapValue.x = pow(sin(uv.x * 200.0), 0.5) * localScale * uBackgroundWaveScale;
  //   }
  // }

  // Circular Waves
  for (int i = 0; i < 3; i += 1) {
    vec2 center = uCircularWave[i].xy;
    if (uCircularWave[i].z > 0.5) {
      vec2 v = uv - center;
      float dist = length(v);
      if (i == 0) {


        // float angle = atan(v.y, v.x);
        // dist += cos(angle * 5.0) * 0.05;


        // vec2 c2 = center + vec2(0.2, 0.3);
        // dist += sin(cos(length(uv - c2)) * 10.0) * 0.5;
        // dist += (uv.x * 0.1 + uv.y * 0.3);
        // dist += pow(length(uv - c2), 1.0) * 0.5;
        // dist *= 2.0 * length(uv - c2);
        // dist /= 3.0;
      }

      // cool
      // if (dist < uCircularWaveRadius[i].x && dist > uCircularWaveRadius[i].y && i == 2) {
      //   heightmapValue.x = pow(sin(dist * 200.0), 0.5) * 10.0;
      // }

      // original
      if (dist < uCircularWaveRadius[i].x && dist > uCircularWaveRadius[i].y) {
        heightmapValue.x = pow(sin(dist * 200.0), 0.5) * localScale;
      }
    }
  }

  // Bumps of Sands
  float d = length(uv - uCircularWave[2].xy);

  // wave
  // float rate = 0.5;
  // float phase = 5.0;
  // float amount = 15.0;
  // float sin1 = sin((uv.x + uv.y) * phase + uTime * rate);
  // float sin2 = sin((uv.x - uv.y) * phase * 2.0 + uTime * rate * 4.0);
  // float sin3 = sin((uv.x + uv.y) * phase * -3.0 + uTime * rate * 2.0);
  // heightmapValue.x += (sin1 * amount * 2.0 + sin2 * amount * 0.4 + sin3 * amount * 0.32) * d;

  // master
  // heightmapValue.x *= pow(uMasterScale, (d + 0.02) * 15.0);
  heightmapValue.x += cnoise2((uv - .5)*500.) * 4.;
  // if (heightmapValue.x < 20.0 && heightmapValue.x > -5.0) {
  //   heightmapValue.x += cnoise2(uv+1000) * 15.;
  // }

  // Ocean

  gl_FragColor = heightmapValue;

}
`;
