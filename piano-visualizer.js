import * as PIXI from 'pixi.js';
import { BloomFilter } from '@pixi/filter-bloom';

const shader = `
precision mediump float;
varying vec2 vTextureCoord;

uniform float time;
uniform vec2 resolution;
uniform float activeKeys[88];
uniform vec3 splashes[32];

vec3 hsv2rgb(vec3 c){
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float ribbon(vec2 uv){
    float y =
        0.22 +
        sin(uv.x * 8.0 + time * 1.3) * 0.03 +
        sin(uv.x * 3.0 + time * 0.7) * 0.04;

    float d = abs(uv.y - y);
    return smoothstep(0.12, 0.0, d);
}

float splashField(vec2 uv, vec2 center, float age){
    vec2 p = uv - center;
    float dist = length(p);

    float radius = age * 0.12;
    float ring = exp(-50.0 * abs(dist - radius));
    float core = exp(-20.0 * dist);

    return (core + ring) * exp(-age * 1.8);
}

vec3 noteStreams(vec2 uv){
    vec3 accum = vec3(0.0);

    for(int i=0;i<88;i++){
        float vel = activeKeys[i];
        if(vel < 0.001) continue;

        float keyX = (float(i)+0.5)/88.0;
        float dx = abs(uv.x - keyX);

        float height = mix(0.25, 0.95, vel);
        float vertical = smoothstep(height, 0.02, uv.y);

        float width = mix(0.008, 0.03, 1.0 - uv.y);

        float beam = exp(-(dx*dx)/(width*width));

        float pulse =
            sin(uv.y * 48.0 - time * 7.0 + float(i)) * 0.5 + 0.5;

        pulse *= pulse;

        float hue = float(i)/88.0;
        vec3 col = hsv2rgb(vec3(hue, 0.55, 1.0));

        accum += col * beam * vertical * pulse * vel;
    }

    return accum;
}

void main(){
    vec2 uv = vTextureCoord;

    uv.y += sin(uv.x * 12.0 + time * 1.6) * 0.01;

    float base = ribbon(uv) * 0.5;

    for(int i=0;i<32;i++){
        vec3 s = splashes[i];
        if(s.z < 0.0) continue;

        float age = time - s.z;
        if(age > 0.0 && age < 2.0){
            base += splashField(uv, s.xy, age);
        }
    }

    vec3 streams = noteStreams(uv);

    vec3 ambient = vec3(0.15, 0.65, 1.0) * base;
    vec3 color = ambient + streams;

    float alpha = clamp(length(color) * 0.35, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);
}
`;

export class PianoVisualizer {
    constructor(app){
        this.app = app;

        this.activeKeys = new Float32Array(88);
        this.splashes = Array.from({length:32}, ()=>[0,0,-999]);

        this.uniforms = {
            time: 0,
            resolution: [app.screen.width, app.screen.height],
            activeKeys: Array.from(this.activeKeys),
            splashes: this.splashes.flat()
        };

        this.filter = new PIXI.Filter(undefined, shader, this.uniforms);

        this.sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.sprite.width = app.screen.width;
        this.sprite.height = app.screen.height;
        this.sprite.filters = [
            this.filter,
            new BloomFilter({
                strength: 1.5,
                blur: 6,
                quality: 4
            })
        ];
        this.sprite.blendMode = PIXI.BLEND_MODES.ADD;

        app.stage.addChild(this.sprite);
    }

    noteOn(note, velocity){
        const index = note - 21;
        if(index < 0 || index >= 88) return;

        const v = velocity / 127;
        this.activeKeys[index] = Math.max(this.activeKeys[index], v);

        const x = (index + 0.5) / 88;
        const y = 0.88;

        let slot = this.splashes.findIndex(
            s => this.uniforms.time - s[2] > 2.0
        );
        if(slot === -1) slot = 0;

        this.splashes[slot] = [x, y, this.uniforms.time];
    }

    noteOff(note){
        const index = note - 21;
        if(index < 0 || index >= 88) return;
    }

    update(delta){
        this.uniforms.time += delta / 60;

        for(let i=0;i<88;i++){
            this.activeKeys[i] *= 0.965;
        }

        this.uniforms.activeKeys = Array.from(this.activeKeys);
        this.uniforms.splashes = this.splashes.flat();
    }
}