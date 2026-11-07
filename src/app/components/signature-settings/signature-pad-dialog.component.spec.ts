import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { SignaturePadDialogComponent } from './signature-pad-dialog.component';

describe('Signature drawing dialog', () => {
  let fixture: ComponentFixture<SignaturePadDialogComponent>;
  let component: SignaturePadDialogComponent;
  let close: jasmine.Spy;
  let canvas: HTMLCanvasElement;
  const pointer = (id: number, x: number, y: number, primary = true) => new PointerEvent('pointermove', {pointerId:id,clientX:x,clientY:y,button:0,isPrimary:primary});
  beforeEach(async () => {
    close = jasmine.createSpy('close');
    await TestBed.configureTestingModule({imports:[SignaturePadDialogComponent],providers:[{provide:MatDialogRef,useValue:{close}}]}).compileComponents();
    fixture=TestBed.createComponent(SignaturePadDialogComponent);component=fixture.componentInstance;fixture.detectChanges();
    canvas=fixture.nativeElement.querySelector('canvas');
    spyOn(canvas,'getBoundingClientRect').and.returnValue({left:0,top:0,width:1000,height:300} as DOMRect);
    spyOn(canvas,'setPointerCapture');spyOn(canvas,'hasPointerCapture').and.returnValue(false);
  });
  afterEach(()=>fixture.destroy());
  function stroke(id=1): void { component.begin(pointer(id,100,100));component.move(pointer(id,200,150));component.move(pointer(id,400,120));component.end(pointer(id,400,120)); }
  it('ignores a second pointer and ends only the active pointer', () => {
    component.begin(pointer(1,100,100));component.begin(pointer(2,700,200,false));component.move(pointer(2,800,250,false));component.end(pointer(2,800,250,false));
    component.move(pointer(1,200,120));
    expect(component.strokes.length).toBe(1);expect(component.strokes[0].length).toBe(2);
  });
  it('undo removes one stroke and clear removes all ink', () => {
    stroke();stroke(2);component.undo();expect(component.strokes.length).toBe(1);component.clear();expect(component.strokes.length).toBe(0);
    component.use();expect(close).not.toHaveBeenCalled();expect(component.error).toContain('visible signature');
  });
  it('preserves vector strokes through resize and exports a PNG only on explicit preview', () => {
    stroke();const before=JSON.stringify(component.strokes);
    (canvas.getBoundingClientRect as jasmine.Spy).and.returnValue({left:0,top:0,width:2000,height:600} as DOMRect);
    component['render']();expect(JSON.stringify(component.strokes)).toBe(before);expect(close).not.toHaveBeenCalled();
    component.use();expect(close).toHaveBeenCalledOnceWith(jasmine.stringMatching(/^iVBOR/));
  });
});
