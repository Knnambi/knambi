/*
 * ultrasonic.js — a wide-beam ultrasonic (sonar-style) range sensor.
 *
 * The beam itself is modeled as a small grid of sample rays spanning the
 * cone's solid angle rather than one ray or a full acoustic wave
 * simulation — a well-justified, explainable simplification ("treat the
 * wide beam as many narrow rays and take the closest usable return")
 * that's cheap enough to run every ping and still produces the sensor's
 * one defining, real behavior: multiple objects in the cone collapse
 * into a single nearest-echo reading, with zero information about which
 * one, or where within the cone, produced it.
 *
 * Per sample ray, three independent real failure modes can reject an
 * otherwise-valid physical hit before it's allowed to become "the"
 * reading:
 *   - angle of incidence: a surface tilted too far from facing the
 *     sensor reflects the pulse away instead of back (specular miss)
 *   - absorption: a "soft" surface returns a much weaker echo, modeled
 *     as a shorter effective range rather than a binary always/never
 *   - the blind zone: a real transducer can't tell its own outgoing
 *     ring-down from an echo of something too close, so anything closer
 *     than minSenseDistance reports TOO_CLOSE rather than a number
 *
 * Timing: each sensor only updates at its own ping rate (10-20 Hz is
 * typical), not continuously — the scene is sampled once at the start
 * of each ping cycle and that ping's result is held until the next one,
 * exactly like a real sensor's output register. See computeVisualState
 * below for how one ping's in-flight/echo/no-echo animation is derived
 * from that same timing.
 */
(function () {
  "use strict";

  const Scene = window.Ultra.Scene;
  const V = window.Vec3;

  function incidenceDeg(dir, normal) {
    const neg = [-dir[0], -dir[1], -dir[2]];
    const d = Math.max(-1, Math.min(1, V.dot(neg, normal)));
    return Math.acos(d) * 180 / Math.PI;
  }

  /**
   * @param sensor  { position:[x,y,z], azimuth, elevation } — cone axis
   * @param cfg     { beamAngleDeg, incidenceLimitDeg, minSenseDistance,
   *                  maxRange, pingRateHz, absorptionRangeFactor,
   *                  speedOfSound, samplesAz, samplesEl }
   * @param sceneObj  from Scene.buildScene()
   * @param simTime   current scene time, seconds
   */
  function simulate(sensor, cfg, sceneObj, simTime) {
    const pingPeriod = 1 / cfg.pingRateHz;
    const pingIndex = Math.floor(simTime / pingPeriod);
    const pingStart = pingIndex * pingPeriod;
    const primitives = sceneObj.primitivesAt(pingStart);

    const halfBeam = cfg.beamAngleDeg / 2;
    let nearest = null; // { range, dir, hit }
    let hitsInCone = 0, incidenceRejects = 0, absorptionRejects = 0;

    for (let j = 0; j < cfg.samplesEl; j++) {
      const elOffset = cfg.samplesEl > 1 ? -halfBeam + (j / (cfg.samplesEl - 1)) * 2 * halfBeam : 0;
      for (let i = 0; i < cfg.samplesAz; i++) {
        const azOffset = cfg.samplesAz > 1 ? -halfBeam + (i / (cfg.samplesAz - 1)) * 2 * halfBeam : 0;
        // Keep the sample grid roughly circular, not square, so a wide
        // beam angle doesn't over-sample its own corners.
        if (azOffset * azOffset + elOffset * elOffset > halfBeam * halfBeam) continue;

        const dir = Scene.rayDirection(sensor.azimuth + azOffset, sensor.elevation + elOffset);
        const hit = Scene.intersectScene(sensor.position, dir, primitives, cfg.maxRange);
        if (!hit) continue;
        hitsInCone++;

        if (incidenceDeg(dir, hit.normal) > cfg.incidenceLimitDeg) { incidenceRejects++; continue; }

        const effectiveMax = hit.primitive.surface === "soft" ? cfg.maxRange * cfg.absorptionRangeFactor : cfg.maxRange;
        if (hit.t > effectiveMax) { absorptionRejects++; continue; }

        if (!nearest || hit.t < nearest.range) nearest = { range: hit.t, dir, hit };
      }
    }

    let status;
    if (!nearest) status = "NO_ECHO";
    else if (nearest.range < cfg.minSenseDistance) status = "TOO_CLOSE";
    else status = "OK";

    const reportedRange = status === "OK" ? nearest.range : null;
    // Round-trip time uses the pulse's own travel distance: to the
    // detected target if there is one, otherwise the full max range (a
    // pulse that finds nothing still travels out to its own limit
    // before the sensor gives up on that ping).
    const travelDistance = nearest ? nearest.range : cfg.maxRange;
    const roundTripTime = (2 * travelDistance) / cfg.speedOfSound;

    return {
      status, reportedRange, pingStart, pingPeriod, roundTripTime, travelDistance,
      hitPoint: nearest ? nearest.hit.point : null,
      hitsInCone, incidenceRejects, absorptionRejects,
      totalSamples: cfg.samplesAz * cfg.samplesEl,
      stats: {
        minRange: cfg.minSenseDistance, maxRange: cfg.maxRange,
        beamAngle: cfg.beamAngleDeg,
        refreshHz: cfg.pingRateHz,
        incidenceFailureRate: hitsInCone > 0 ? incidenceRejects / hitsInCone : 0,
      },
    };
  }

  // Derives what a viewport should draw right now for one ping's
  // result: the outbound cone grows from 0 to its travel distance over
  // the pulse's own round-trip time, then holds in its final state
  // (echo confirmed / no echo / too close) until the next ping. The
  // inbound leg isn't separately animated as a shrinking wavefront —
  // physically that's a single point-like echo, not a cone-shaped
  // return — so it's instead shown as a marker appearing at the hit
  // point once the round trip completes. See README.
  function computeVisualState(result, simTime) {
    const elapsed = simTime - result.pingStart;
    const growing = elapsed < result.roundTripTime;
    // travelDistance is already exactly right for every status: the
    // detected target's range, or the full maxRange for a pulse that
    // found nothing to reflect off within the cone at all.
    const finalLength = result.travelDistance;
    const coneLength = growing
      ? Math.max(0.01, (elapsed / Math.max(1e-6, result.roundTripTime)) * finalLength)
      : finalLength;
    let phase;
    if (result.status === "TOO_CLOSE") phase = "too-close";
    else if (growing) phase = "in-flight";
    else if (result.status === "OK") phase = "echo-returned";
    else phase = "no-echo";
    return { coneLength, phase, showHitMarker: !growing && result.status === "OK" };
  }

  function crossTalkApply(sensors, results, cfg, simTime) {
    if (!cfg.crossTalkEnabled) return results;
    // Adjacent sensors (by array order) whose cones overlap in azimuth
    // can, in a real array, pick up each other's pulse. Modeled as: on
    // every ping cycle, a sensor has a fixed chance of reporting its
    // neighbor's true reading instead of its own — deterministic per
    // ping index (not random noise) so toggling this control produces a
    // reliably observable effect rather than an occasional glitch.
    return results.map((r, i) => {
      const left = sensors[(i - 1 + sensors.length) % sensors.length];
      const right = sensors[(i + 1) % sensors.length];
      const angleTo = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
      const overlapsLeft = angleTo(sensors[i].azimuth, left.azimuth) < cfg.beamAngleDeg;
      const overlapsRight = angleTo(sensors[i].azimuth, right.azimuth) < cfg.beamAngleDeg;
      if (!overlapsLeft && !overlapsRight) return r;
      const pingIndex = Math.floor(simTime / (1 / cfg.pingRateHz));
      if (pingIndex % 3 !== i % 3) return r; // stagger which sensor is "hit" each cycle
      const donorIdx = overlapsRight ? (i + 1) % sensors.length : (i - 1 + sensors.length) % sensors.length;
      const donor = results[donorIdx];
      return Object.assign({}, donor, { crossTalkFrom: donorIdx, status: donor.status === "OK" ? "OK" : donor.status });
    });
  }

  window.Ultra = window.Ultra || {};
  window.Ultra.Ultrasonic = { simulate, computeVisualState, crossTalkApply };
})();
