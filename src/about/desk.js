// JUIT — "About" scene: a night-time creator's desk (inline SVG string).
// Interactive objects (data-object): camera, gamepad, sketch, monitor.
// Styles + idle animations live in desk.css.

export function deskSVG() {
  return `<svg class="desk-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="desk-title" stroke-linejoin="round" stroke-linecap="round">
<title id="desk-title">İçerik üreticisinin gece masası</title>
<defs>
<linearGradient id="desk-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505"/><stop offset="1" stop-color="#0A0A0A"/></linearGradient>
<radialGradient id="desk-wall-glow"><stop offset="0" stop-color="#8B3DFF" stop-opacity=".34"/><stop offset=".5" stop-color="#8B3DFF" stop-opacity=".12"/><stop offset="1" stop-color="#8B3DFF" stop-opacity="0"/></radialGradient>
<linearGradient id="desk-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B2B2B"/><stop offset="1" stop-color="#171717"/></linearGradient>
<radialGradient id="desk-pool"><stop offset="0" stop-color="#C9A0FF" stop-opacity=".9"/><stop offset=".4" stop-color="#8B3DFF" stop-opacity=".5"/><stop offset=".75" stop-color="#8B3DFF" stop-opacity=".16"/><stop offset="1" stop-color="#8B3DFF" stop-opacity="0"/></radialGradient>
<linearGradient id="desk-cone" gradientUnits="userSpaceOnUse" x1="248" y1="268" x2="430" y2="520"><stop offset="0" stop-color="#B67CFF" stop-opacity=".4"/><stop offset="1" stop-color="#B67CFF" stop-opacity="0"/></linearGradient>
<radialGradient id="desk-bulb"><stop offset="0" stop-color="#F5F5F5"/><stop offset=".5" stop-color="#B67CFF"/><stop offset="1" stop-color="#8B3DFF"/></radialGradient>
<radialGradient id="desk-lens" cx=".5" cy=".5" r=".5" fx=".35" fy=".3"><stop offset="0" stop-color="#B67CFF"/><stop offset=".5" stop-color="#8B3DFF"/><stop offset="1" stop-color="#1B1426"/></radialGradient>
<radialGradient id="desk-mon-glow"><stop offset="0" stop-color="#8B3DFF" stop-opacity=".7"/><stop offset="1" stop-color="#8B3DFF" stop-opacity="0"/></radialGradient>
<linearGradient id="desk-screen-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A0A0A"/><stop offset="1" stop-color="#171717"/></linearGradient>
<linearGradient id="desk-page-l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C4B8DC"/><stop offset="1" stop-color="#A99DC4"/></linearGradient>
<linearGradient id="desk-page-r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A99DC4"/><stop offset="1" stop-color="#9588B3"/></linearGradient>
<filter id="desk-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="desk-blur-s" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
<clipPath id="desk-clip"><path d="M60 392H1140L1200 566H0Z"/></clipPath>
</defs>

<g class="desk-bg" pointer-events="none">
<rect width="1200" height="640" fill="url(#desk-wall)"/>
<g class="desk-light"><circle cx="250" cy="280" r="400" fill="url(#desk-wall-glow)"/><path d="M201 295L295 241L640 480L600 560L180 560Z" fill="url(#desk-cone)" filter="url(#desk-blur)"/></g>
<g class="desk-screen"><ellipse cx="1025" cy="330" rx="270" ry="200" fill="url(#desk-mon-glow)" opacity=".45"/></g>

<path d="M60 392H1140L1200 566H0Z" fill="url(#desk-top)" stroke="#1B1426" stroke-width="3.5"/>
<g clip-path="url(#desk-clip)" fill="none" stroke="#1B1426" stroke-opacity=".55" stroke-width="2"><path d="M0 436H1200M0 486H1200M0 538H1200"/></g>
<rect x="0" y="566" width="1200" height="38" fill="#171717" stroke="#1B1426" stroke-width="3.5"/>
<path d="M0 576H1200" stroke="#2B2B2B" stroke-width="2"/>
<rect x="44" y="604" width="48" height="44" fill="#0A0A0A" stroke="#1B1426" stroke-width="3.5"/>
<rect x="1108" y="604" width="48" height="44" fill="#0A0A0A" stroke="#1B1426" stroke-width="3.5"/>

<g class="desk-light" clip-path="url(#desk-clip)"><ellipse cx="350" cy="486" rx="440" ry="96" fill="url(#desk-pool)"/></g>
<g class="desk-screen" clip-path="url(#desk-clip)"><ellipse cx="1025" cy="524" rx="230" ry="46" fill="url(#desk-mon-glow)"/></g>

<g fill="#000" opacity=".5" filter="url(#desk-blur-s)">
<ellipse cx="124" cy="446" rx="62" ry="9"/>
<ellipse cx="140" cy="548" rx="64" ry="7"/>
<ellipse cx="340" cy="553" rx="88" ry="8"/>
<ellipse cx="514" cy="549" rx="88" ry="8"/>
<ellipse cx="736" cy="558" rx="140" ry="8"/>
<ellipse cx="1040" cy="497" rx="90" ry="8"/>
<ellipse cx="1132" cy="559" rx="34" ry="5"/>
</g>

<g class="desk-lamp" stroke="#1B1426" stroke-width="3.5">
<path d="M58 424v8a52 12 0 0 0 104 0v-8z" fill="#171717"/>
<ellipse cx="110" cy="424" rx="52" ry="12" fill="#2B2B2B"/>
<path d="M110 420L150 300" fill="none" stroke-width="14"/>
<path d="M110 420L150 300" fill="none" stroke="#2B2B2B" stroke-width="7"/>
<path d="M150 300L230 240" fill="none" stroke-width="13"/>
<path d="M150 300L230 240" fill="none" stroke="#2B2B2B" stroke-width="6"/>
<circle cx="110" cy="420" r="9" fill="#8C8C8C"/>
<circle cx="150" cy="300" r="10" fill="#8C8C8C"/>
<g transform="translate(232 240) rotate(-30)">
<ellipse cx="0" cy="32" rx="54" ry="13" fill="url(#desk-bulb)"/>
<path d="M-16 -14Q0 -22 16 -14L54 32A54 13 0 0 0 -54 32Z" fill="#8B3DFF"/>
<path d="M-10 -10L-38 26" fill="none" stroke="#B67CFF" stroke-width="4" opacity=".7"/>
</g>
</g>
<g class="desk-light"><circle cx="248" cy="268" r="54" fill="#B67CFF" opacity=".45" filter="url(#desk-blur)"/></g>

<g class="desk-papers" stroke="#1B1426" stroke-width="3">
<path d="M82 496H172L184 544H70Z" fill="#7F739E"/>
<path d="M88 490H178L190 538H76Z" fill="#9D90BB"/>
<path d="M94 484H184L196 532H82Z" fill="#B9ADD2"/>
<path d="M102 497H122" fill="none" stroke="#8B3DFF" stroke-width="4"/>
<path d="M102 508H176M102 518H178M102 528H156" fill="none" stroke="#6F6490" stroke-width="3"/>
</g>

<g class="desk-mug" stroke="#1B1426" stroke-width="3.5">
<path d="M1142 521C1164 518 1164 546 1142 543" fill="none" stroke-width="10"/>
<path d="M1142 521C1164 518 1164 546 1142 543" fill="none" stroke="#8B3DFF" stroke-width="4"/>
<path d="M1098 514v34a22 7 0 0 0 44 0v-34z" fill="#8B3DFF"/>
<ellipse cx="1120" cy="514" rx="22" ry="7" fill="#171717"/>
<ellipse cx="1120" cy="514" rx="17" ry="4.5" fill="#0A0A0A" stroke-width="2"/>
<path d="M1105 524v17" fill="none" stroke="#B67CFF" stroke-width="3.5" opacity=".75"/>
</g>
</g>

<g class="desk-objs">

<g class="desk-obj" data-object="camera" tabindex="0" role="button" aria-label="Kamera — içerik">
<title>Kamera — içerik</title>
<g stroke="#1B1426" stroke-width="3.5">
<path d="M322 446L262 536M322 446L382 536M322 446V551" fill="none" stroke-width="11"/>
<path d="M322 446L262 536M322 446L382 536M322 446V551" fill="none" stroke="#8C8C8C" stroke-width="4.5"/>
<circle cx="262" cy="538" r="5.5" fill="#171717"/><circle cx="382" cy="538" r="5.5" fill="#171717"/><circle cx="322" cy="553" r="5.5" fill="#171717"/>
<rect x="317" y="428" width="10" height="18" fill="#8C8C8C"/>
<ellipse cx="322" cy="446" rx="12" ry="7" fill="#2B2B2B"/>
<circle cx="322" cy="424" r="7.5" fill="#2B2B2B"/>
<rect x="296" y="406" width="52" height="11" rx="3" fill="#8C8C8C"/>
<path d="M298 318L304 298H340L346 318Z" fill="#2B2B2B"/>
<rect x="309" y="303" width="26" height="6" rx="3" fill="#0A0A0A" stroke="none"/>
<rect x="262" y="306" width="24" height="13" rx="3" fill="#8C8C8C"/>
<rect x="360" y="308" width="14" height="11" rx="3" fill="#8C8C8C"/>
<rect x="252" y="316" width="140" height="92" rx="14" fill="#2B2B2B"/>
<rect x="252" y="326" width="34" height="82" rx="12" fill="#171717"/>
<rect x="358" y="344" width="34" height="64" rx="10" fill="#171717"/>
<path d="M262 346V388M270 346V388" fill="none" stroke="#2B2B2B" stroke-width="2.5"/>
<path d="M270 318.5H378" fill="none" stroke="#B67CFF" stroke-width="2" opacity=".5"/>
<circle cx="322" cy="364" r="40" fill="#171717"/>
<circle cx="322" cy="364" r="33" fill="#2B2B2B" stroke-width="2.5"/>
<circle cx="322" cy="364" r="28" fill="none" stroke="#0A0A0A" stroke-width="3" stroke-dasharray="2 4"/>
<circle cx="322" cy="364" r="22" fill="#0A0A0A"/>
<circle cx="322" cy="364" r="17" fill="url(#desk-lens)" stroke-width="2.5"/>
<path d="M311 358A12 12 0 0 1 320 351" fill="none" stroke="#F5F5F5" stroke-width="2" opacity=".85"/>
<path d="M287.2 351.3A37 37 0 0 1 309.3 329.2" fill="none" stroke="#B67CFF" stroke-width="2.5" opacity=".6"/>
<g class="desk-led"><circle cx="375" cy="331" r="9" fill="#FF3B4E" opacity=".4" stroke="none" filter="url(#desk-blur-s)"/><circle cx="375" cy="331" r="4.5" fill="#FF3B4E" stroke-width="2"/><circle cx="373.8" cy="329.8" r="1.5" fill="#F5C542" stroke="none"/></g>
</g>
<rect class="desk-hit" x="242" y="292" width="160" height="266" rx="12" fill="transparent"/>
</g>

<g class="desk-obj" data-object="gamepad" tabindex="0" role="button" aria-label="Kumanda — oyun geliştirme">
<title>Kumanda — oyun geliştirme</title>
<g transform="translate(500 506) scale(1 .92)" stroke="#1B1426" stroke-width="3.5">
<ellipse cx="0" cy="42" rx="80" ry="10" fill="#8B3DFF" opacity=".5" stroke="none" filter="url(#desk-blur-s)"/>
<rect x="-66" y="-46" width="38" height="14" rx="7" fill="#171717"/>
<rect x="28" y="-46" width="38" height="14" rx="7" fill="#171717"/>
<path d="M-48 -34C-30 -40 30 -40 48 -34C62 -34 74 -14 78 14C82 38 74 46 62 46C48 46 42 30 30 24L-30 24C-42 30 -48 46 -62 46C-74 46 -82 38 -78 14C-74 -14 -62 -34 -48 -34Z" fill="#2B2B2B"/>
<path d="M-44 -33C-28 -38 28 -38 44 -33" fill="none" stroke="#B67CFF" stroke-width="2.5" opacity=".55"/>
<circle cx="-42" cy="-8" r="13" fill="#0A0A0A"/>
<circle cx="-42" cy="-8" r="8.5" fill="#8B3DFF" stroke-width="2.5"/>
<path d="M-46 -11A5 5 0 0 1 -41 -13.5" fill="none" stroke="#B67CFF" stroke-width="2"/>
<circle cx="20" cy="10" r="12" fill="#0A0A0A"/>
<circle cx="20" cy="10" r="7.5" fill="#8B3DFF" stroke-width="2.5"/>
<path d="M16 7A5 5 0 0 1 21 4.5" fill="none" stroke="#B67CFF" stroke-width="2"/>
<path d="M-23.5 0H-16.5V6.5H-10V13.5H-16.5V20H-23.5V13.5H-30V6.5H-23.5Z" fill="#0A0A0A" stroke-width="3"/>
<circle cx="-20" cy="10" r="2" fill="#B67CFF" stroke="none"/>
<circle cx="42" cy="-18" r="5.5" fill="#B67CFF" stroke-width="2.5"/>
<circle cx="52" cy="-8" r="5.5" fill="#8B3DFF" stroke-width="2.5"/>
<circle cx="42" cy="2" r="5.5" fill="#8B3DFF" stroke-width="2.5"/>
<circle cx="32" cy="-8" r="5.5" fill="#8B3DFF" stroke-width="2.5"/>
<circle cx="0" cy="-20" r="5" fill="#B67CFF" stroke-width="2.5"/>
<circle cx="-12" cy="-8" r="3" fill="#8C8C8C" stroke-width="2"/>
<circle cx="12" cy="-8" r="3" fill="#8C8C8C" stroke-width="2"/>
</g>
<rect class="desk-hit" x="418" y="452" width="164" height="104" rx="12" fill="transparent"/>
</g>

<g class="desk-obj" data-object="sketch" tabindex="0" role="button" aria-label="Çizim defteri — Mobu &amp; animasyon">
<title>Çizim defteri — Mobu &amp; animasyon</title>
<g stroke="#1B1426" stroke-width="3.5">
<path d="M598 410L727 422L856 410V540L727 552L598 540Z" fill="#171717"/>
<path d="M608 528L727 540L846 528V535L727 547L608 535Z" fill="#7B6F9A" stroke-width="2.5"/>
<g transform="matrix(1 .1 0 1 608 416)">
<rect width="119" height="112" fill="url(#desk-page-l)" stroke-width="2.5"/>
<g fill="none" stroke-width="1.8">
<rect x="9" y="10" width="45" height="40" rx="2"/><rect x="65" y="10" width="45" height="40" rx="2"/>
<rect x="9" y="58" width="45" height="40" rx="2"/><rect x="65" y="58" width="45" height="40" rx="2"/>
</g>
<g fill="#8B3DFF" stroke-width="1.8">
<ellipse cx="31.5" cy="41" rx="8" ry="4.5"/><ellipse cx="87.5" cy="30" rx="5" ry="9"/>
<circle cx="31.5" cy="72" r="6"/><ellipse cx="87.5" cy="84" rx="5" ry="9"/>
</g>
</g>
<g transform="matrix(1 -.1 0 1 727 428)">
<rect width="119" height="112" fill="url(#desk-page-r)" stroke-width="2.5"/>
<g stroke-width="2.5">
<path d="M55.5 35.1L76.5 13.3L67.9 36.7L96.2 25.8L78.5 43.5L106.9 46.2L85.3 54.1Z" fill="#8B3DFF"/>
<circle cx="26" cy="68" r="9" fill="#8B3DFF"/><circle cx="90" cy="68" r="9" fill="#8B3DFF"/>
<circle cx="26" cy="68" r="4" fill="#E9DDFF" stroke="none"/><circle cx="90" cy="68" r="4" fill="#E9DDFF" stroke="none"/>
<circle cx="58" cy="64" r="30" fill="#8B3DFF"/>
<ellipse cx="58" cy="71" rx="21" ry="17" fill="#E9DDFF" stroke-width="2"/>
<path d="M45 68h9M62 68h9" fill="none" stroke-width="3.8"/>
<path d="M53 77q5 4 10 0" fill="none" stroke-width="2"/>
</g>
<path d="M14 104H46" fill="none" stroke="#7F739E" stroke-width="2.5" opacity=".8"/>
</g>
<g fill="#2B2B2B" stroke-width="2.5">
<rect x="720" y="440" width="14" height="7" rx="3.5"/><rect x="720" y="462" width="14" height="7" rx="3.5"/><rect x="720" y="484" width="14" height="7" rx="3.5"/><rect x="720" y="506" width="14" height="7" rx="3.5"/><rect x="720" y="528" width="14" height="7" rx="3.5"/>
</g>
<g transform="translate(796 524) rotate(-24)" stroke-width="2.5">
<path d="M0 -4L-12 0L0 4Z" fill="#E9DDFF"/>
<path d="M-12 0L-7.5 -1.6V1.6Z" fill="#1B1426" stroke="none"/>
<rect x="0" y="-4" width="42" height="8" fill="#F5C542"/>
<rect x="42" y="-4" width="5" height="8" fill="#8C8C8C"/>
<rect x="47" y="-4" width="7" height="8" rx="2" fill="#B67CFF"/>
</g>
</g>
<rect class="desk-hit" x="596" y="396" width="262" height="162" rx="12" fill="transparent"/>
</g>

<g class="desk-obj" data-object="monitor" tabindex="0" role="button" aria-label="Monitör — deneyler">
<title>Monitör — deneyler</title>
<g stroke="#1B1426" stroke-width="3.5">
<ellipse cx="1025" cy="486" rx="72" ry="12" fill="#171717"/>
<ellipse cx="1025" cy="481" rx="72" ry="12" fill="#2B2B2B"/>
<path d="M1006 418H1044L1048 478H1002Z" fill="#2B2B2B"/>
<path d="M1011 430V470" fill="none" stroke="#B67CFF" stroke-width="2.5" opacity=".5"/>
<rect x="890" y="248" width="270" height="170" rx="10" fill="#171717"/>
<rect x="900" y="258" width="250" height="146" rx="4" fill="url(#desk-screen-bg)" stroke-width="2.5"/>
<g class="desk-screen" stroke="none">
<rect x="900" y="258" width="250" height="14" fill="#171717"/>
<circle cx="910" cy="265" r="2.2" fill="#8B3DFF"/><circle cx="919" cy="265" r="2.2" fill="#8C8C8C"/><circle cx="928" cy="265" r="2.2" fill="#8C8C8C"/>
<rect x="938" y="262" width="44" height="10" rx="2" fill="#2B2B2B"/>
<rect x="944" y="265" width="26" height="4" rx="2" fill="#8C8C8C" opacity=".7"/>
<rect x="900" y="272" width="24" height="132" fill="#121212"/>
<rect x="924" y="312" width="226" height="16" fill="#8B3DFF" opacity=".14"/>
<g fill="#3A3A3A"><rect x="908" y="284" width="8" height="4" rx="2"/><rect x="908" y="301" width="8" height="4" rx="2"/><rect x="908" y="318" width="8" height="4" rx="2"/><rect x="908" y="335" width="8" height="4" rx="2"/><rect x="908" y="352" width="8" height="4" rx="2"/><rect x="908" y="369" width="8" height="4" rx="2"/><rect x="908" y="386" width="8" height="4" rx="2"/></g>
<g fill="none" stroke-width="6" stroke-linecap="round">
<g stroke="#8C8C8C" opacity=".6"><path d="M973 286h57M947 303h41M1036 303h24M947 320h63M1005 337h53M959 354h85M981 371h37M1028 371h26M935 388h41"/></g>
<g stroke="#8B3DFF"><path d="M935 286h28M1020 320h22M947 371h24"/></g>
<g stroke="#B67CFF"><path d="M998 303h28M959 337h36"/></g>
</g>
<rect x="1076" y="284" width="64" height="44" rx="4" fill="#171717" stroke="#2B2B2B" stroke-width="2"/>
<circle cx="1108" cy="306" r="18" fill="#8B3DFF" opacity=".3" filter="url(#desk-blur-s)"/>
<circle cx="1108" cy="306" r="12" fill="#8B3DFF"/>
<path d="M1104 299.5L1114.5 306L1104 312.5Z" fill="#F5F5F5"/>
<path d="M900 258H1000L920 404H900Z" fill="#F5F5F5" opacity=".04"/>
</g>
<circle cx="1025" cy="411" r="2" fill="#B67CFF" stroke="none"/>
</g>
<rect class="desk-hit" x="878" y="236" width="292" height="264" rx="12" fill="transparent"/>
</g>

</g>
</svg>`;
}
