const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<dcr:definitions xmlns:dcr="http://tk/schema/dcr" xmlns:dcrDi="http://tk/schema/dcrDi" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">
  <dcr:dcrGraph id="dcrGraph">
    <dcr:event id="Event_01rzn5e" role="Test" description="" included="true" executed="false" pending="false" enabled="false" />
    <dcr:event id="Event_1yttgtd" description="" included="true" executed="false" pending="false" enabled="false" />
    <dcr:event id="Event_1z0kins" description="" included="true" executed="false" pending="false" enabled="false" />
    <dcr:event id="Event_0mj6wyy" description="" included="true" executed="false" pending="false" enabled="false" />
    <dcr:relation id="Relation_0u8jox9" type="condition" sourceRef="Event_1z0kins" targetRef="Event_0mj6wyy" />
    <dcr:relation id="Relation_0x8gslb" type="include" sourceRef="Event_01rzn5e" targetRef="Event_1yttgtd" />
  </dcr:dcrGraph>
  <dcrDi:dcrRootBoard id="RootBoard">
    <dcrDi:dcrPlane id="Plane" boardElement="dcrGraph">
      <dcrDi:relation id="Relation_0u8jox9_di" boardElement="Relation_0u8jox9">
        <dcrDi:waypoint x="730" y="1045" />
        <dcrDi:waypoint x="885" y="1045" />
        <dcrDi:waypoint x="885" y="995" />
        <dcrDi:waypoint x="1040" y="995" />
      </dcrDi:relation>
      <dcrDi:relation id="Relation_0x8gslb_di" boardElement="Relation_0x8gslb">
        <dcrDi:waypoint x="480" y="655" />
        <dcrDi:waypoint x="660" y="655" />
        <dcrDi:waypoint x="660" y="685" />
        <dcrDi:waypoint x="840" y="685" />
      </dcrDi:relation>
      <dcrDi:dcrShape id="Event_01rzn5e_di" boardElement="Event_01rzn5e">
        <dc:Bounds x="350" y="580" width="130" height="150" />
      </dcrDi:dcrShape>
      <dcrDi:dcrShape id="Event_1yttgtd_di" boardElement="Event_1yttgtd">
        <dc:Bounds x="840" y="610" width="130" height="150" />
      </dcrDi:dcrShape>
      <dcrDi:dcrShape id="Event_1z0kins_di" boardElement="Event_1z0kins">
        <dc:Bounds x="600" y="970" width="130" height="150" />
      </dcrDi:dcrShape>
      <dcrDi:dcrShape id="Event_0mj6wyy_di" boardElement="Event_0mj6wyy">
        <dc:Bounds x="1040" y="920" width="130" height="150" />
      </dcrDi:dcrShape>
    </dcrDi:dcrPlane>
  </dcrDi:dcrRootBoard>
</dcr:definitions>`

export default sampleXML;